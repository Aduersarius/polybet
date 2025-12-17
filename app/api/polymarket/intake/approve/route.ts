import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

// Polymarket prices-history rejects long intervals; keep it tight.
const HISTORY_LOOKBACK_DAYS = 7;
const HISTORY_RESOLUTION = '5m';
const BUCKET_MS = 5 * 60 * 1000; // enforce 5m buckets even if Polymarket returns 1m candles
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

async function backfillOddsHistory(params: {
  prisma: any;
  eventId: string;
  outcomeId: string;
  tokenId?: string;
  marketId?: string;
  lookbackDays?: number;
  resolution?: string;
  fallbackProbability?: number;
}) {
  const {
    prisma,
    eventId,
    outcomeId,
    tokenId,
    marketId,
    lookbackDays = HISTORY_LOOKBACK_DAYS,
    resolution = HISTORY_RESOLUTION,
    fallbackProbability,
  } = params;
  if (!tokenId || typeof tokenId !== 'string' || tokenId.trim().length === 0) return;

  try {
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - lookbackDays * 24 * 60 * 60;
    // API expects market=<tokenId> for price history (token_id not required)
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
      console.error('[Polymarket] prices-history failed', {
        tokenId,
        marketId,
        status: resp.status,
        statusText: resp.statusText,
        body,
      });
      return;
    }
    const data = await resp.json();
    const points = Array.isArray(data?.history)
      ? data.history
      : Array.isArray(data?.prices)
      ? data.prices
      : Array.isArray(data)
      ? data
      : [];
    let effectivePoints = points;
    if (!effectivePoints.length) {
      console.warn('[Polymarket] prices-history returned 0 points', {
        tokenId,
        marketId,
        lookbackDays,
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
      console.log('[Polymarket] odds history backfill stored', result.count, 'rows for', tokenId, marketId);
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
      console.log('[Polymarket] odds history backfill stored via raw insert', rows.length, 'rows for', tokenId, marketId);
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

  const normalizedOutcomeMapping = Array.isArray(outcomeMapping) ? dedupeOutcomeNames(outcomeMapping) : [];
  // Fetch tokens up front to infer multiplicity from the market even if mapping is incomplete.
  const { tokens: marketTokens = [] } = await fetchTokensForMarket(polymarketId);

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
      const name = o.name || `Outcome ${idx + 1}`;
      const probability = typeof o.probability === 'number' ? o.probability : 0.5;

      const baseOutcomeData = {
        eventId: dbEvent.id,
        probability,
        polymarketOutcomeId,
        polymarketMarketId: polymarketId,
        source: 'POLYMARKET',
      };

      // Prefer polymarketOutcomeId for uniqueness; fallback to (eventId, name).
      const upsertByPolyId =
        polymarketOutcomeId && prisma.outcome.upsert
          ? prisma.outcome.upsert({
              where: { polymarketOutcomeId },
              update: { ...baseOutcomeData, name },
              create: { ...baseOutcomeData, name },
            })
          : null;

      try {
        if (upsertByPolyId) {
          await upsertByPolyId;
        } else {
          await prisma.outcome.upsert({
            where: { eventId_name: { eventId: dbEvent.id, name } },
            update: { ...baseOutcomeData },
            create: { ...baseOutcomeData, name },
          });
        }
      } catch (err) {
        // Fallback: if composite key not available, try update-first then create
        const existingOutcome = polymarketOutcomeId
          ? await prisma.outcome.findFirst({
              where: { polymarketOutcomeId },
              select: { id: true },
            })
          : await prisma.outcome.findFirst({
              where: { eventId: dbEvent.id, name },
              select: { id: true },
            });

        if (existingOutcome) {
          await prisma.outcome.update({
            where: { id: existingOutcome.id },
            data: {
              eventId: dbEvent.id,
              name,
              probability,
              polymarketOutcomeId,
              polymarketMarketId: polymarketId,
              source: 'POLYMARKET',
            },
          });
        } else {
          await prisma.outcome.create({
            data: {
              eventId: dbEvent.id,
              name,
              probability,
              polymarketOutcomeId,
              polymarketMarketId: polymarketId,
              source: 'POLYMARKET',
            },
          });
        }
      }
    }

    // Build map after outcomes are persisted
    const outcomeIdsByName: Record<string, string> = {};
    const outcomeIdsByPolyId: Record<string, string> = {};
    const dbOutcomes = await prisma.outcome.findMany({
      where: { eventId: dbEvent.id },
      select: { id: true, name: true, polymarketOutcomeId: true },
    });
    for (const o of dbOutcomes) {
      outcomeIdsByName[o.name] = o.id;
      if (o.polymarketOutcomeId) {
        outcomeIdsByPolyId[o.polymarketOutcomeId] = o.id;
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
      });
    }

    return NextResponse.json({ success: true, mapping });
  } catch (error) {
    console.error('[Polymarket Intake] approve failed', error);
    return NextResponse.json(
      { error: 'Failed to approve Polymarket mapping' },
      { status: 500 }
    );
  }
}

