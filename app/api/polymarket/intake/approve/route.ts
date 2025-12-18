import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

// Load full history from event creation instead of limiting to 7 days
// If Polymarket API rejects very long intervals, we'll chunk the requests
const HISTORY_RESOLUTION = '5m';
const BUCKET_MS = 5 * 60 * 1000; // enforce 5m buckets even if Polymarket returns 1m candles
const MAX_CHUNK_DAYS = 90; // Maximum days per API request to avoid rejection
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';

async function getSystemCreatorId(prisma: any) {
  const envId = process.env.POLYMARKET_CREATOR_ID;
  if (envId) {
    const user = await prisma.user.findUnique({ where: { id: envId }, select: { id: true } });
    if (user) return user.id;
  }

  const admin = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admin) return admin.id;

  const anyUser = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!anyUser) throw new Error('No users available to assign as creator for Polymarket intake');
  return anyUser.id;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeProbability(raw: any) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return clamp01(n / 100);
  return clamp01(n);
}

function dedupeOutcomeNames(raw: any[] = []) {
  const seen = new Set<string>();
  const isBinary = raw.length === 2;

  return raw.map((o, idx) => {
    const incoming = typeof o?.name === 'string' ? o.name.trim() : '';
    const looksGeneric = incoming === '' || /^outcome$/i.test(incoming);
    let name = incoming;

    // For binary markets, default to Yes/No when names are missing or generic.
    if (looksGeneric && isBinary) {
      name = idx === 0 ? 'Yes' : 'No';
    }

    if (!name) {
      name = `Outcome ${idx + 1}`;
    }

    // Ensure uniqueness even if the intake sent duplicate labels.
    let candidate = name;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${name} ${suffix++}`;
    }
    seen.add(candidate);

    return { ...o, name: candidate };
  });
}

async function fetchOrderbookMid(tokenId: string): Promise<number | undefined> {
  const url = `${POLYMARKET_CLOB_API_URL}/orderbook?token_id=${encodeURIComponent(tokenId)}`;
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) {
      console.warn('[Polymarket] orderbook mid fallback failed', {
        tokenId,
        status: resp.status,
        statusText: resp.statusText,
      });
      return undefined;
    }
    const data = await resp.json();
    const bids = Array.isArray(data?.bids) ? data.bids : Array.isArray(data?.data?.bids) ? data.data.bids : [];
    const asks = Array.isArray(data?.asks) ? data.asks : Array.isArray(data?.data?.asks) ? data.data.asks : [];
    const bestBid = bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : undefined;
    const bestAsk = asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : undefined;
    const hasBestBid = typeof bestBid === 'number' && Number.isFinite(bestBid);
    const hasBestAsk = typeof bestAsk === 'number' && Number.isFinite(bestAsk);
    let mid: number | undefined;
    if (hasBestBid && hasBestAsk) mid = ((bestBid as number) + (bestAsk as number)) / 2;
    else if (hasBestAsk) mid = bestAsk as number;
    else if (hasBestBid) mid = bestBid as number;
    return Number.isFinite(mid) ? (mid as number) : undefined;
  } catch (err) {
    console.warn('[Polymarket] orderbook mid fallback error', { tokenId, err });
    return undefined;
  }
}

async function fetchOddsHistoryChunk(
  tokenId: string,
  startSec: number,
  endSec: number,
  resolution: string
): Promise<any[]> {
  const url = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(
    tokenId
  )}&resolution=${resolution}&startTs=${startSec}&endTs=${endSec}`;

  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    let body = '';
    try {
      body = await resp.text();
    } catch {
      // ignore
    }
    // If it's a 400/422, it might be rejecting the interval - return empty array
    if (resp.status === 400 || resp.status === 422) {
      console.warn('[Polymarket] prices-history rejected interval', {
        tokenId,
        status: resp.status,
        startSec,
        endSec,
        days: (endSec - startSec) / (24 * 60 * 60),
      });
      return [];
    }
    console.error('[Polymarket] prices-history failed', {
      tokenId,
      status: resp.status,
      statusText: resp.statusText,
      body,
    });
    return [];
  }
  const data = await resp.json();
  return Array.isArray(data?.history)
    ? data.history
    : Array.isArray(data?.prices)
    ? data.prices
    : Array.isArray(data)
    ? data
    : [];
}

async function backfillOddsHistory(params: {
  prisma: any;
  eventId: string;
  outcomeId: string;
  tokenId?: string;
  marketId?: string;
  lookbackDays?: number;
  resolution?: string;
  fallbackProbability?: number;
  eventCreatedAt?: Date;
}) {
  const {
    prisma,
    eventId,
    outcomeId,
    tokenId,
    marketId,
    lookbackDays,
    resolution = HISTORY_RESOLUTION,
    fallbackProbability,
    eventCreatedAt,
  } = params;
  if (!tokenId || typeof tokenId !== 'string' || tokenId.trim().length === 0) return;

  try {
    // Fetch event creation date if not provided
    let eventStartDate = eventCreatedAt;
    if (!eventStartDate) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { createdAt: true },
      });
      if (event) {
        eventStartDate = event.createdAt;
      }
    }

    const endSec = Math.floor(Date.now() / 1000);
    let startSec: number;

    if (eventStartDate) {
      // Use event creation date as start
      startSec = Math.floor(eventStartDate.getTime() / 1000);
    } else if (lookbackDays) {
      // Fallback to lookbackDays if provided
      startSec = endSec - lookbackDays * 24 * 60 * 60;
    } else {
      // Default to 1 year if nothing else is available
      startSec = endSec - 365 * 24 * 60 * 60;
    }

    // Calculate total days to fetch
    const totalDays = (endSec - startSec) / (24 * 60 * 60);

    // If the interval is too large, chunk it into multiple requests
    let allPoints: any[] = [];
    if (totalDays > MAX_CHUNK_DAYS) {
      // Chunk the requests to avoid API rejection
      let currentStart = startSec;
      const chunkDays = MAX_CHUNK_DAYS;
      const chunkSeconds = chunkDays * 24 * 60 * 60;

      while (currentStart < endSec) {
        const chunkEnd = Math.min(currentStart + chunkSeconds, endSec);
        console.log(`[Polymarket] Fetching history chunk: ${new Date(currentStart * 1000).toISOString()} to ${new Date(chunkEnd * 1000).toISOString()}`);
        
        const chunkPoints = await fetchOddsHistoryChunk(tokenId, currentStart, chunkEnd, resolution);
        allPoints = allPoints.concat(chunkPoints);

        // Move to next chunk
        currentStart = chunkEnd;
        
        // Small delay between chunks to avoid rate limiting
        if (currentStart < endSec) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } else {
      // Single request for shorter intervals
      allPoints = await fetchOddsHistoryChunk(tokenId, startSec, endSec, resolution);
    }

    let effectivePoints = allPoints;
    if (!effectivePoints.length) {
      console.warn('[Polymarket] prices-history returned 0 points', {
        tokenId,
        marketId,
        totalDays: totalDays.toFixed(1),
        resolution,
      });
      const mid = await fetchOrderbookMid(tokenId);
      if (mid != null) {
        effectivePoints = [
          {
            timestamp: Date.now(),
            price: mid,
            probability: clamp01(mid),
          },
        ];
      } else if (Number.isFinite(fallbackProbability)) {
        // Final fallback: use provided probability (from intake mapping) to seed one point
        effectivePoints = [
          {
            timestamp: Date.now(),
            price: fallbackProbability,
            probability: clamp01(fallbackProbability as number),
          },
        ];
      }
    }

    const bucketedMap = new Map<number, any>();
    for (const p of effectivePoints) {
      // Polymarket timeseries uses `t` for timestamp and `p` for price.
      const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
      if (!Number.isFinite(tsRaw)) continue;
      const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
      const bucketTs = Math.floor(tsMs / BUCKET_MS) * BUCKET_MS;
      const priceRaw = p.price ?? p.probability ?? p.p ?? p.value;
      if (priceRaw == null) continue;
      const prob = normalizeProbability(priceRaw);
      // Overwrite within the bucket, keeping the latest sample seen.
      bucketedMap.set(bucketTs, {
        eventId,
        outcomeId,
        polymarketTokenId: tokenId,
        timestampMs: bucketTs,
        price: Number(priceRaw),
        probability: prob,
        source: 'POLYMARKET',
      });
    }

    const rows = Array.from(bucketedMap.values());

    if (!rows.length) {
      console.warn('[Polymarket] odds history parsing produced 0 rows', {
        tokenId,
        marketId,
        pointCount: effectivePoints.length,
      });
      return;
    }

    if (prisma?.oddsHistory?.createMany) {
      const result = await prisma.oddsHistory.createMany({
        data: rows.map((r: any) => {
          const { timestampMs, ...rest } = r;
          return {
            ...rest,
            timestamp: new Date(timestampMs),
          };
        }) as any[],
        skipDuplicates: true,
      });
      console.log('[Polymarket] odds history backfill stored', result.count, 'rows for', tokenId, marketId, `(${totalDays.toFixed(1)} days)`);
    } else {
      // Fallback for environments where Prisma client is stale but table exists
      const values = rows
        .map(
          (r: any) =>
            `('${r.eventId}','${r.outcomeId}','${r.polymarketTokenId || ''}','${new Date(r.timestampMs).toISOString()}',${r.price},${r.probability},'${r.source}','${new Date().toISOString()}')`
        )
        .join(',');

      const sql = `
        INSERT INTO "OddsHistory" ("eventId","outcomeId","polymarketTokenId","timestamp","price","probability","source","createdAt")
        VALUES ${values}
        ON CONFLICT ("eventId","outcomeId","timestamp") DO NOTHING;
      `;

      await prisma.$executeRawUnsafe(sql);
      console.log('[Polymarket] odds history backfill stored via raw insert', rows.length, 'rows for', tokenId, marketId, `(${totalDays.toFixed(1)} days)`);
    }
  } catch (err) {
    console.error('[Polymarket] odds history backfill failed', { tokenId, marketId, err });
  }
}

async function fetchTokensForMarket(polymarketId: string): Promise<{ tokens: string[]; marketId?: string }> {
  try {
    const resp = await fetch(`${POLYMARKET_CLOB_API_URL}/markets`, { cache: 'no-store' });
    if (!resp.ok) return { tokens: [] };
    const json = await resp.json();
    const markets = Array.isArray(json?.markets) ? json.markets : Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const match = markets.find((m: any) => {
      const mId = m.id || m.market_id || m.slug || m.question_id || m.condition_id;
      return String(mId) === String(polymarketId);
    });
    if (!match) return { tokens: [] };
    const marketId = match.question_id || match.market_id || match.market_slug || match.id || match.slug;
    const tokens = Array.isArray(match.tokens)
      ? match.tokens
          .map((t: any) => t?.token_id || t?.tokenId || t?.id)
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      : [];
    return { tokens: tokens as string[], marketId: marketId ? String(marketId) : undefined };
  } catch (err) {
    console.warn('[Polymarket] failed to fetch tokens for market', polymarketId, err);
    return { tokens: [] };
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth(request);
    const body = await request.json();
    const {
      polymarketId,
      polymarketConditionId,
      polymarketTokenId,
      internalEventId: incomingInternalEventId,
      outcomeMapping,
      eventData,
      notes,
      updatedBy,
    } = body;

    const internalEventId =
      incomingInternalEventId ||
      String(Math.floor(100_000_000 + Math.random() * 900_000_000)); // fallback random int

    const tokenIdForLegacy = polymarketTokenId || outcomeMapping?.[0]?.polymarketTokenId;

    if (!polymarketId || !internalEventId || !tokenIdForLegacy) {
      return NextResponse.json(
        { error: 'polymarketId, polymarketTokenId, and internalEventId are required' },
        { status: 400 }
      );
    }

    const { prisma } = await import('@/lib/prisma');
    const { invalidate } = await import('@/lib/cache');

    // Prefer existing mapping by internalEventId; otherwise reuse a rejected mapping for same polymarketId
    const existingByInternal = await prisma.polymarketMarketMapping.findUnique({
      where: { internalEventId },
    });

    let targetId = existingByInternal?.id;
    if (!targetId) {
      try {
        const rejected = await prisma.polymarketMarketMapping.findFirst({
          where: { polymarketId },
        });
        targetId = rejected?.id;
      } catch (e) {
        // If the schema is not migrated (no status column), ignore and proceed
        console.warn('[Polymarket Intake] fallback mapping lookup failed', e);
      }
    }

  const data: any = {
    internalEventId,
    polymarketId,
    polymarketConditionId: polymarketConditionId ?? null,
    polymarketTokenId: tokenIdForLegacy,
    isActive: true,
  };

  let normalizedOutcomeMapping = Array.isArray(outcomeMapping) ? dedupeOutcomeNames(outcomeMapping) : [];
  // Fetch tokens up front to infer multiplicity from the market even if mapping is incomplete.
  const { tokens: marketTokens = [] } = await fetchTokensForMarket(polymarketId);

  // If the admin/UI sent an incomplete mapping (common root cause of "multi-outcome loads as binary"),
  // expand it using Polymarket token list so we don't silently collapse to 2 outcomes.
  if (marketTokens.length > 0 && normalizedOutcomeMapping.length < marketTokens.length) {
    for (let idx = normalizedOutcomeMapping.length; idx < marketTokens.length; idx++) {
      normalizedOutcomeMapping.push({
        internalOutcomeId: `${internalEventId}-${idx}`,
        polymarketTokenId: marketTokens[idx],
        name: `Outcome ${idx + 1}`,
      });
    }
    normalizedOutcomeMapping = dedupeOutcomeNames(normalizedOutcomeMapping);
  }

    // Include optional fields guarded; not all environments may have migrated schema
    try {
      data.status = 'approved';
      data.decisionAt = new Date();
      data.updatedBy = updatedBy || 'admin';
      data.notes = notes || null;
    if (normalizedOutcomeMapping.length) {
        data.outcomeMapping = {
        outcomes: normalizedOutcomeMapping.map((o: any, idx: number) => ({
            internalId: o.internalOutcomeId || `${internalEventId}-${idx}`,
          polymarketId: o.polymarketTokenId || o.polymarketId,
          name: o.name,
            probability: typeof o.probability === 'number' ? o.probability : undefined,
          })),
        };
      }
    } catch {
      // ignore if schema not migrated
    }

    const mapping = targetId
      ? await prisma.polymarketMarketMapping.update({
          where: { id: targetId },
          data,
        })
      : await prisma.polymarketMarketMapping.create({ data });

    // Ensure Event exists for this mapping and mirror Polymarket info
    // Reuse existing event by internalEventId or polymarketId to avoid unique constraint errors
    const existingEventById = await prisma.event.findUnique({
      where: { id: internalEventId },
    });
    const existingEventByPoly = await prisma.event.findUnique({
      where: { polymarketId },
    });

    // If an event already exists for this polymarketId, align internalEventId to it
    const effectiveEventId = existingEventByPoly?.id || existingEventById?.id || internalEventId;

    const creatorId = await getSystemCreatorId(prisma);
    const fallbackResolutionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const resolutionDateStr =
      eventData?.resolutionDate || eventData?.endDate || eventData?.startDate || fallbackResolutionDate.toISOString();
    const resolutionDate = new Date(resolutionDateStr);
    const categories =
      (Array.isArray(eventData?.categories) ? eventData.categories.filter(Boolean) : []).slice(0, 5);
    const inferredOutcomeCount = Math.max(normalizedOutcomeMapping.length, marketTokens.length);
    const type = inferredOutcomeCount > 2 ? 'MULTIPLE' : 'BINARY';
    const status = resolutionDate.getTime() < Date.now() ? 'CLOSED' : 'ACTIVE';
    const imageUrl = eventData?.image || eventData?.imageUrl || null;

    const baseEventData: any = {
      title: eventData?.title || `Polymarket ${polymarketId.slice(0, 8)}`,
      description: eventData?.description || '',
      categories,
      imageUrl,
      resolutionDate,
      status,
      creatorId,
      type,
      source: 'POLYMARKET',
      polymarketId,
      resolutionSource: eventData?.resolutionSource || 'POLYMARKET',
      externalVolume: eventData?.volume ?? 0,
      externalBetCount: eventData?.betCount ?? 0,
      isHidden: false,
    };

    const dbEvent = await prisma.event.upsert({
      where: { polymarketId },
      update: baseEventData,
      create: {
        id: effectiveEventId,
        ...baseEventData,
      },
    });

    // If the existing event was binary but we inferred >2 outcomes, force type correction.
    if (dbEvent.type !== type) {
      await prisma.event.update({
        where: { id: dbEvent.id },
        data: { type },
      });
      dbEvent.type = type;
    }

    // Bust cached event responses (by id and polymarketId)
    try {
      await invalidate(`evt:${effectiveEventId}`, 'event');
      await invalidate(`poly:${polymarketId}`, 'event');
    } catch {
      // best-effort cache bust
    }

    // Ensure mapping uses the actual event id
    if (mapping.internalEventId !== dbEvent.id) {
      await prisma.polymarketMarketMapping.update({
        where: { id: mapping.id },
        data: { internalEventId: dbEvent.id },
      });
    }

    // Upsert outcomes to mirror Polymarket
    const outcomesFromMapping = normalizedOutcomeMapping;
    for (const [idx, o] of outcomesFromMapping.entries()) {
      let polymarketOutcomeId = o.polymarketTokenId || o.polymarketId;
      let marketIdForHistory: string | undefined =
        eventData?.polymarketMarketId || eventData?.polymarketConditionId || eventData?.conditionId || polymarketConditionId || polymarketId;
      if (!polymarketOutcomeId) {
        const { tokens, marketId } = await fetchTokensForMarket(polymarketId);
        if (marketId) marketIdForHistory = marketId;
        if (tokens[idx]) {
          polymarketOutcomeId = tokens[idx];
          o.polymarketTokenId = polymarketOutcomeId;
        } else if (tokens[0]) {
          polymarketOutcomeId = tokens[0];
          o.polymarketTokenId = polymarketOutcomeId;
        }
      }
      // Persist marketId hint for later backfill loop
      (o as any)._marketIdForHistory = marketIdForHistory;
      // For binary events, normalize names to YES/NO
      let name = o.name || '';
      if (dbEvent.type === 'BINARY') {
        if (!name || /^outcome$/i.test(name.trim())) {
          // Infer YES/NO from position or existing pattern
          if (idx === 0 || /yes|true|will/i.test(name)) name = 'YES';
          else if (idx === 1 || /no|false|won't/i.test(name)) name = 'NO';
          else name = idx === 0 ? 'YES' : 'NO';
        }
      } else {
        name = name || `Outcome ${idx + 1}`;
      }
      
      // Only use probability if it's valid (0-1 range), otherwise leave undefined
      // Handle both probability (0-1) and percentage (0-100) formats
      let probability: number | undefined = undefined;
      if (typeof o.probability === 'number') {
        if (o.probability >= 0 && o.probability <= 1) {
          probability = o.probability;
        } else if (o.probability > 1 && o.probability <= 100) {
          // It's a percentage, convert to probability
          probability = o.probability / 100;
        }
        // If > 100, it's likely a strike level or invalid, leave undefined
      }

      // For binary events, calculate probability from qYes/qNo if we don't have it
      let finalProbability = probability;
      if (dbEvent.type === 'BINARY' && finalProbability === undefined) {
        // We'll set this after qYes/qNo is calculated below
        finalProbability = 0.5; // Temporary, will be recalculated
      }
      
      const baseOutcomeData = {
        eventId: dbEvent.id,
        probability: finalProbability ?? 0.5, // DB requires a value
        polymarketOutcomeId,
        polymarketMarketId: polymarketId,
        source: 'POLYMARKET',
      };

      // Upsert outcome deterministically without triggering cross-unique conflicts:
      // - polymarketOutcomeId is global-unique
      // - (eventId, name) is unique within an event
      const existingByPoly = polymarketOutcomeId
        ? await prisma.outcome.findFirst({
            where: { polymarketOutcomeId },
            select: { id: true, eventId: true, name: true, polymarketOutcomeId: true },
          })
        : null;

      const existingByName = await prisma.outcome.findFirst({
        where: { eventId: dbEvent.id, name },
        select: { id: true, eventId: true, name: true, polymarketOutcomeId: true },
      });

      if (existingByPoly) {
        // If we'd collide on name within the event, don't rename; still update pricing + ids.
        const nameConflict =
          existingByName && existingByName.id !== existingByPoly.id ? true : false;
        await prisma.outcome.update({
          where: { id: existingByPoly.id },
          data: nameConflict ? { ...baseOutcomeData } : { ...baseOutcomeData, name },
        });
      } else if (existingByName) {
        // Safe to attach polymarketOutcomeId only if it's not already taken elsewhere (we checked existingByPoly above).
        await prisma.outcome.update({
          where: { id: existingByName.id },
          data: { ...baseOutcomeData, name },
        });
      } else {
        // No conflicts: create new
        await prisma.outcome.create({
          data: { ...baseOutcomeData, name },
        });
      }
    }

    // Build map after outcomes are persisted
    const outcomeIdsByName: Record<string, string> = {};
    const outcomeIdsByPolyId: Record<string, string> = {};
    const dbOutcomes = await prisma.outcome.findMany({
      where: { eventId: dbEvent.id },
      select: { id: true, name: true, polymarketOutcomeId: true, probability: true },
    });
    for (const o of dbOutcomes) {
      outcomeIdsByName[o.name] = o.id;
      if (o.polymarketOutcomeId) {
        outcomeIdsByPolyId[o.polymarketOutcomeId] = o.id;
      }
    }

    // For binary events, normalize outcome names to YES/NO and set qYes/qNo from probabilities
    if (dbEvent.type === 'BINARY' && dbOutcomes.length >= 2) {
      // Normalize outcome names to YES/NO for consistency
      const yesOutcome = dbOutcomes.find((o: any) => /yes/i.test(o.name));
      const noOutcome = dbOutcomes.find((o: any) => /no/i.test(o.name));
      
      // Update outcome names to YES/NO if they're not already
      if (yesOutcome && !/^yes$/i.test(yesOutcome.name)) {
        await prisma.outcome.update({
          where: { id: yesOutcome.id },
          data: { name: 'YES' },
        });
      }
      if (noOutcome && !/^no$/i.test(noOutcome.name)) {
        await prisma.outcome.update({
          where: { id: noOutcome.id },
          data: { name: 'NO' },
        });
      }
      
      // If we don't have YES/NO outcomes, rename the first two
      if (!yesOutcome || !noOutcome) {
        if (dbOutcomes[0] && !/^yes$/i.test(dbOutcomes[0].name)) {
          await prisma.outcome.update({
            where: { id: dbOutcomes[0].id },
            data: { name: 'YES' },
          });
        }
        if (dbOutcomes[1] && !/^no$/i.test(dbOutcomes[1].name)) {
          await prisma.outcome.update({
            where: { id: dbOutcomes[1].id },
            data: { name: 'NO' },
          });
        }
      }
      
      // Refresh outcomes after name updates
      const updatedOutcomes = await prisma.outcome.findMany({
        where: { eventId: dbEvent.id },
        select: { id: true, name: true, probability: true },
      });
      
      const finalYesOutcome = updatedOutcomes.find((o: any) => /^yes$/i.test(o.name));
      const finalNoOutcome = updatedOutcomes.find((o: any) => /^no$/i.test(o.name));
      
      let yesProb = finalYesOutcome?.probability ?? updatedOutcomes[0]?.probability ?? 0.5;
      let noProb = finalNoOutcome?.probability ?? updatedOutcomes[1]?.probability ?? (1 - yesProb);
      
      // Normalize to ensure they sum to 1
      const sum = yesProb + noProb;
      if (sum > 0) {
        yesProb = yesProb / sum;
        noProb = noProb / sum;
      }
      
      // Convert probabilities to qYes/qNo using inverse LMSR
      const b = dbEvent.liquidityParameter || 20000.0;
      const qYes = yesProb > 0.01 && yesProb < 0.99 ? b * Math.log(yesProb / (1 - yesProb)) : 0;
      const qNo = noProb > 0.01 && noProb < 0.99 ? b * Math.log(noProb / (1 - noProb)) : 0;
      
      await prisma.event.update({
        where: { id: dbEvent.id },
        data: { qYes, qNo },
      });
      
      // Update outcome probabilities to match qYes/qNo for consistency
      // (reuse finalYesOutcome and finalNoOutcome from above)
      if (finalYesOutcome) {
        await prisma.outcome.update({
          where: { id: finalYesOutcome.id },
          data: { probability: yesProb },
        });
      }
      if (finalNoOutcome) {
        await prisma.outcome.update({
          where: { id: finalNoOutcome.id },
          data: { probability: noProb },
        });
      }
    }

    // Backfill odds history for each mapped outcome/token
    for (const [idx, o] of outcomesFromMapping.entries()) {
      const name = o.name || `Outcome ${idx + 1}`;
      const mappingPolyId = o.polymarketTokenId || o.polymarketId;
      const outcomeId = (mappingPolyId ? outcomeIdsByPolyId[mappingPolyId] : undefined) || outcomeIdsByName[name];
      if (!outcomeId) continue;
      const marketIdForHistory: string | undefined =
        (o as any)._marketIdForHistory ||
        eventData?.polymarketMarketId ||
        eventData?.polymarketConditionId ||
        eventData?.conditionId ||
        polymarketConditionId ||
        polymarketId;
      await backfillOddsHistory({
        prisma,
        eventId: dbEvent.id,
        outcomeId,
        tokenId: o.polymarketTokenId,
        marketId: marketIdForHistory,
        fallbackProbability: typeof o.probability === 'number' ? o.probability : undefined,
        eventCreatedAt: dbEvent.createdAt,
      });
    }

    // Trigger Polymarket WebSocket stream ingestion for fresh odds updates (fire-and-forget)
    // This ensures the newly mapped event starts receiving live updates immediately
    // The stream endpoint will pick up this mapping since it queries for isActive: true
    (async () => {
      try {
        const streamUrl = process.env.NEXT_PUBLIC_APP_URL 
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/polymarket/history/stream`
          : 'http://localhost:3000/api/polymarket/history/stream';
        
        // Fire-and-forget: trigger stream ingestion (non-blocking)
        fetch(streamUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5s timeout to avoid hanging
        }).catch((err) => {
          // Silently fail - the periodic cron job will pick it up anyway
          console.log('[Polymarket] Stream trigger failed (non-critical):', err.message);
        });
        
        console.log('[Polymarket] Triggered WebSocket stream ingestion for event', dbEvent.id);
      } catch (err) {
        // Ignore errors - this is best-effort
        console.log('[Polymarket] Could not trigger stream ingestion:', err);
      }
    })();

    return NextResponse.json({ success: true, mapping });
  } catch (error) {
    console.error('[Polymarket Intake] approve failed', error);
    return NextResponse.json(
      { error: 'Failed to approve Polymarket mapping' },
      { status: 500 }
    );
  }
}

