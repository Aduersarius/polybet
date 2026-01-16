import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import { promptLLM } from '@/lib/llm';
import { scaleVolumeForStorage } from '@/lib/volume-scaler';

export const runtime = 'nodejs';

// Load full history from event creation instead of limiting to 7 days
// If Polymarket API rejects very long intervals, we'll chunk the requests
const HISTORY_RESOLUTION = '30m';
const BUCKET_MS = 30 * 60 * 1000; // enforce 30m buckets for consistent candle intervals
const MAX_CHUNK_DAYS = 30; // Maximum days per API request (reduced from 90 due to API rejections)
const FALLBACK_CHUNK_DAYS = 7; // Fallback chunk size if MAX_CHUNK_DAYS is rejected
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';

const ALLOWED_CATEGORIES = [
  "Business", "Crypto", "Culture", "Economy", "Elections",
  "Finance", "Politics", "Science", "Sports", "Tech", "World", "Esports"
];
const CATEGORY_PROMPT_LIST = ALLOWED_CATEGORIES.join(", ");

async function categorizeWithLLM(title: string): Promise<string[]> {
  try {
    const prompt = `Classify event: "${title}".
Choose 1-2 categories from: [${CATEGORY_PROMPT_LIST}].
Return ONLY the category names, comma-separated.`;

    const content = await promptLLM(prompt, { operation: 'categorize_event' });
    if (!content) return [];

    const categories = content.split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && ALLOWED_CATEGORIES.includes(s))
      .slice(0, 2);

    console.log('[LLM] Categorized "%s" ->', title, categories);
    return categories;
  } catch (err) {
    console.warn("[LLM] Categorization failed", err);
    return [];
  }
}

/**
 * Generate a short, engaging description for an event using LLM.
 * Based on title and rules (from Polymarket).
 */
async function generateDescriptionWithLLM(title: string, rules?: string): Promise<string> {
  try {
    const rulesContext = rules && rules.trim().length > 0
      ? `\n\nResolution rules: ${rules.slice(0, 500)}`
      : '';

    const prompt = `Write a 1-2 sentence engaging description for this prediction market event:

Title: "${title}"${rulesContext}

Requirements:
- Be concise and informative (max 150 characters)
- Don't repeat the title
- Don't include resolution criteria
- Make it sound like a teaser that gets users interested
- Return ONLY the description, no quotes or prefixes`;

    const content = await promptLLM(prompt, { maxTokens: 100, operation: 'generate_description' });
    if (!content) return '';

    // Clean up any quotes or prefixes
    const cleaned = content
      .replace(/^["']|["']$/g, '')
      .replace(/^description:\s*/i, '')
      .trim();

    console.log(`[LLM] Generated description for "${title.slice(0, 30)}...": "${cleaned.slice(0, 50)}..."`);
    return cleaned;
  } catch (err) {
    console.warn("[LLM] Description generation failed", err);
    return '';
  }
}

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
      name = idx === 0 ? 'YES' : 'NO';
    }

    // For binary markets, normalize Yes/No variants to uppercase
    if (isBinary) {
      if (/^yes$/i.test(name)) {
        name = 'YES';
      } else if (/^no$/i.test(name)) {
        name = 'NO';
      }
    }

    if (!name) {
      name = `Outcome ${idx + 1}`;
    }

    // Use case-insensitive comparison for deduplication to prevent
    // "Yes" and "YES" from being treated as different outcomes
    const canonicalKey = name.toLowerCase();
    let candidate = name;
    let suffix = 2;
    while (seen.has(candidate.toLowerCase())) {
      candidate = `${name} ${suffix++}`;
    }
    seen.add(candidate.toLowerCase());

    return { ...o, name: candidate };
  });
}

async function fetchOrderbookMid(tokenId: string): Promise<number | undefined> {
  const MAX_ALLOWED_SPREAD = 0.30; // 30% max spread - wider spreads produce garbage mid-prices
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

    // VALIDATION: Require BOTH bid AND ask to exist (no one-sided orderbooks)
    if (!hasBestBid || !hasBestAsk) {
      console.warn('[Polymarket] orderbook one-sided, skipping mid calculation', { tokenId, hasBestBid, hasBestAsk });
      return undefined;
    }

    // VALIDATION: Check spread is reasonable (wide spreads like 0.01/0.99 produce garbage 50% mid)
    const spread = (bestAsk as number) - (bestBid as number);
    if (spread > MAX_ALLOWED_SPREAD) {
      console.warn('[Polymarket] orderbook spread too wide (%s% > %s%), skipping',
        (spread * 100).toFixed(1),
        MAX_ALLOWED_SPREAD * 100,
        { tokenId }
      ); return undefined;
    }

    const mid = ((bestBid as number) + (bestAsk as number)) / 2;
    return Number.isFinite(mid) ? mid : undefined;
  } catch (err) {
    console.warn('[Polymarket] orderbook mid fallback error', { tokenId, err });
    return undefined;
  }
}

async function fetchOddsHistoryChunk(
  tokenId: string,
  startSec: number,
  endSec: number,
  resolution: string,
  retryWithSmallerChunks: boolean = false
): Promise<any[]> {
  const requestedDays = (endSec - startSec) / (24 * 60 * 60);

  // Fetch full history with uniform 30-minute fidelity for consistent candle intervals
  // This provides ~48 candles per day, balancing data density with storage efficiency
  let allHistory: any[] = [];
  const historyMap = new Map<number, any>(); // timestamp -> point (for deduplication)

  const historyUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(
    tokenId
  )}&interval=max&fidelity=30`;

  console.log(`[Polymarket] Fetching full history with interval=max, fidelity=30min (uniform candles)`);
  const historyResp = await fetch(historyUrl, { cache: 'no-store' });

  if (historyResp.ok) {
    const data = await historyResp.json();
    const history = Array.isArray(data?.history)
      ? data.history
      : Array.isArray(data?.prices)
        ? data.prices
        : Array.isArray(data)
          ? data
          : [];

    if (history.length > 0) {
      // Add all points to map
      history.forEach((point: any) => {
        const tsRaw = Number(point.timestamp ?? point.time ?? point.ts ?? point.t);
        const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
        if (Number.isFinite(tsSec)) {
          historyMap.set(tsSec, point);
        }
      });

      const timestamps = Array.from(historyMap.keys()).sort((a, b) => a - b);
      if (timestamps.length > 0) {
        const earliest = timestamps[0];
        const latest = timestamps[timestamps.length - 1];
        const dataDays = (latest - earliest) / (24 * 60 * 60);
        console.log(`[Polymarket] 30min fidelity: ${history.length} points covering ${dataDays.toFixed(1)} days (${new Date(earliest * 1000).toISOString()} to ${new Date(latest * 1000).toISOString()})`);
      }
    }
  }

  // Convert map to array
  allHistory.push(...Array.from(historyMap.values()));

  // Strategy 2: If interval=max didn't give us enough data, try chunked requests with old API
  if (allHistory.length > 0) {
    const timestamps = allHistory
      .map((p: any) => {
        const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
        return tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
      })
      .filter((ts: number) => Number.isFinite(ts))
      .sort((a: number, b: number) => a - b);

    if (timestamps.length > 0) {
      const earliest = timestamps[0];
      const latest = timestamps[timestamps.length - 1];
      const dataDays = (latest - earliest) / (24 * 60 * 60);

      // If we got less than 80% of requested days, try chunked approach
      if (dataDays < requestedDays * 0.8 && requestedDays > 30) {
        console.log(`[Polymarket] interval=max only returned ${dataDays.toFixed(1)} days, trying chunked requests for older data`);

        // Try to get older data by chunking backwards from the earliest point we have
        const chunkDays = 7; // Use 7-day chunks
        const chunkSeconds = chunkDays * 24 * 60 * 60;
        let currentEnd = earliest;
        const additionalPoints: any[] = [];

        while (currentEnd > startSec && additionalPoints.length < 500000) { // Safety limit increased for full history
          const chunkStart = Math.max(currentEnd - chunkSeconds, startSec);
          console.log(`[Polymarket] Fetching chunk: ${new Date(chunkStart * 1000).toISOString()} to ${new Date(currentEnd * 1000).toISOString()}`);

          // Use fidelity=30 to match our 30-minute candle interval
          const chunkUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(
            tokenId
          )}&startTs=${chunkStart}&endTs=${currentEnd}&fidelity=30`;

          const chunkResp = await fetch(chunkUrl, { cache: 'no-store' });
          if (chunkResp.ok) {
            const chunkData = await chunkResp.json();
            const chunkHistory = Array.isArray(chunkData?.history)
              ? chunkData.history
              : Array.isArray(chunkData?.prices)
                ? chunkData.prices
                : Array.isArray(chunkData)
                  ? chunkData
                  : [];

            if (chunkHistory.length > 0) {
              additionalPoints.push(...chunkHistory);
              console.log(`[Polymarket] Got ${chunkHistory.length} additional points from chunk`);
            }
          }

          currentEnd = chunkStart;
          if (currentEnd > startSec) {
            await new Promise(resolve => setTimeout(resolve, 300)); // Delay between chunks
          }
        }

        if (additionalPoints.length > 0) {
          // Merge and deduplicate by timestamp
          const allPointsMap = new Map<number, any>();

          [...allHistory, ...additionalPoints].forEach((point: any) => {
            const tsRaw = Number(point.timestamp ?? point.time ?? point.ts ?? point.t);
            const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
            if (Number.isFinite(tsSec)) {
              // Keep the point with higher fidelity (more detailed) if timestamps match
              const existing = allPointsMap.get(tsSec);
              if (!existing || (point.p && existing.p && Math.abs(point.p - existing.p) < 0.001)) {
                allPointsMap.set(tsSec, point);
              }
            }
          });

          // Clear and repopulate instead of reassigning
          allHistory.length = 0;
          allHistory.push(...Array.from(allPointsMap.values()));
          console.log(`[Polymarket] Combined ${allHistory.length} total points from interval=max and chunked requests`);
        }
      }
    }
  } else {
    // Fallback to old API format if interval=max completely failed
    console.warn(`[Polymarket] interval=max failed, trying old API format`);
    const oldUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(
      tokenId
    )}&startTs=${startSec}&endTs=${endSec}&fidelity=30`;
    const oldResp = await fetch(oldUrl, { cache: 'no-store' });

    if (oldResp.ok) {
      const oldData = await oldResp.json();
      const fallbackHistory = Array.isArray(oldData?.history)
        ? oldData.history
        : Array.isArray(oldData?.prices)
          ? oldData.prices
          : Array.isArray(oldData)
            ? oldData
            : [];
      allHistory.push(...fallbackHistory);
    }
  }

  // Filter by date range if needed
  if (allHistory.length > 0 && startSec > 0) {
    const filtered = allHistory.filter((point: any) => {
      const tsRaw = Number(point.timestamp ?? point.time ?? point.ts ?? point.t);
      const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
      return Number.isFinite(tsSec) && tsSec >= startSec && tsSec <= endSec;
    });
    console.log(`[Polymarket] Filtered ${filtered.length} points from ${allHistory.length} total (range: ${new Date(startSec * 1000).toISOString()} to ${new Date(endSec * 1000).toISOString()})`);
    return filtered;
  }

  return allHistory;
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
  polymarketStartDate?: string | Date; // Polymarket market creation date
}): Promise<number | undefined> {
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
    polymarketStartDate,
  } = params;
  if (!tokenId || typeof tokenId !== 'string' || tokenId.trim().length === 0) return;

  try {
    const endSec = Math.floor(Date.now() / 1000);
    let startSec: number;

    // Priority 1: Use Polymarket market creation date if available (most accurate)
    if (polymarketStartDate) {
      const polyDate = typeof polymarketStartDate === 'string' ? new Date(polymarketStartDate) : polymarketStartDate;
      if (!isNaN(polyDate.getTime())) {
        const polySec = Math.floor(polyDate.getTime() / 1000);
        const nowSec = Math.floor(Date.now() / 1000);
        // CRITICAL: Don't use future dates - cap to current time
        // Check against actual current time, not endSec (which might be slightly off)
        if (polySec > nowSec) {
          console.warn(`[Polymarket] Polymarket start date is in the future (${polyDate.toISOString()}, now: ${new Date().toISOString()}), using 1-year lookback instead`);
          startSec = endSec - 365 * 24 * 60 * 60;
        } else {
          startSec = polySec;
          const daysAgo = (endSec - startSec) / (24 * 60 * 60);
          console.log(`[Polymarket] Using Polymarket market start date: ${polyDate.toISOString()} (${daysAgo.toFixed(1)} days ago)`);
        }
      } else {
        console.warn(`[Polymarket] Invalid Polymarket start date format, using 1-year lookback`);
        startSec = endSec - 365 * 24 * 60 * 60;
      }
    } else if (lookbackDays) {
      // Priority 2: Use explicit lookbackDays if provided
      startSec = endSec - lookbackDays * 24 * 60 * 60;
      console.log(`[Polymarket] Using lookbackDays: ${lookbackDays} days`);
    } else {
      // Priority 3: Default to 1 year lookback (more reliable than DB creation date)
      // DB creation date is when we first ingested, not when Polymarket created the market
      startSec = endSec - 365 * 24 * 60 * 60;
      console.log(`[Polymarket] Using default 1-year lookback (DB createdAt may be inaccurate for existing markets)`);

      // Log DB creation date for debugging
      if (eventCreatedAt) {
        const dbAgeDays = (endSec - Math.floor(eventCreatedAt.getTime() / 1000)) / (24 * 60 * 60);
        console.log(`[Polymarket] DB event createdAt: ${eventCreatedAt.toISOString()} (${dbAgeDays.toFixed(1)} days ago)`);
      }
    }

    // Final safety check: ensure startSec is not in the future and not too far in the past
    // Use fresh timestamp to avoid any timing issues
    const currentTimeSec = Math.floor(Date.now() / 1000);
    if (startSec > currentTimeSec) {
      const futureDate = new Date(startSec * 1000);
      const nowDate = new Date();
      console.warn(`[Polymarket] Calculated start date is in the future (${futureDate.toISOString()} vs now ${nowDate.toISOString()}), capping to 1-year lookback`);
      startSec = currentTimeSec - 365 * 24 * 60 * 60; // Use 1 year lookback from actual current time
    }

    // Cap lookback to reasonable maximum (2 years) to avoid API issues
    const maxLookbackSec = 2 * 365 * 24 * 60 * 60;
    if (endSec - startSec > maxLookbackSec) {
      console.warn(`[Polymarket] Requested lookback exceeds 2 years, capping to 2 years`);
      startSec = endSec - maxLookbackSec;
    }

    // Ensure startSec doesn't exceed endSec (final safety net)
    if (startSec > endSec) {
      startSec = endSec - 365 * 24 * 60 * 60;
    }

    // Calculate total days to fetch
    const totalDays = (endSec - startSec) / (24 * 60 * 60);
    console.log(`[Polymarket] Requesting odds history: ${new Date(startSec * 1000).toISOString()} to ${new Date(endSec * 1000).toISOString()} (${totalDays.toFixed(1)} days)`);

    // Use interval=max to get ALL available history in one request (much more efficient)
    // The fetchOddsHistoryChunk function will filter by date range if needed
    console.log(`[Polymarket] Fetching full history with interval=max (will filter to requested range)`);
    let allPoints = await fetchOddsHistoryChunk(tokenId, startSec, endSec, resolution, false);
    console.log(`[Polymarket] Received ${allPoints.length} points from interval=max request`);

    // Check if we got data and log the actual date range
    if (allPoints.length > 0) {
      const timestamps = allPoints
        .map(p => {
          const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
          return tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
        })
        .filter(ts => Number.isFinite(ts))
        .sort((a, b) => a - b);

      if (timestamps.length > 0) {
        const earliest = new Date(timestamps[0]);
        const latest = new Date(timestamps[timestamps.length - 1]);
        const actualDays = (timestamps[timestamps.length - 1] - timestamps[0]) / (24 * 60 * 60 * 1000);
        console.log(`[Polymarket] Actual data range: ${earliest.toISOString()} to ${latest.toISOString()} (${actualDays.toFixed(1)} days)`);

        // Warn if we got much less than requested
        if (actualDays < totalDays * 0.5) {
          console.warn(`[Polymarket] WARNING: Only received ${actualDays.toFixed(1)} days of data, but requested ${totalDays.toFixed(1)} days. Polymarket API may be limiting historical data.`);
        }
      }
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
      if (result.count === 0 && rows.length > 0) {
        console.log(`[Polymarket] odds history backfill: all ${rows.length} rows were duplicates (already stored)`);
      } else {
        console.log('[Polymarket] odds history backfill stored', result.count, 'rows for', tokenId, marketId, `(${totalDays.toFixed(1)} days)`);
      }
    } else {
      // Fallback for environments where Prisma client is stale but table exists
      // SECURITY FIX: Use parameterized queries instead of string concatenation
      let insertedCount = 0;
      for (const r of rows) {
        try {
          await prisma.$executeRaw`
            INSERT INTO "OddsHistory" ("eventId", "outcomeId", "polymarketTokenId", "timestamp", "price", "probability", "source", "createdAt")
            VALUES (${r.eventId}, ${r.outcomeId}, ${r.polymarketTokenId || null}, ${new Date(r.timestampMs)}, ${r.price}, ${r.probability}, ${r.source}, ${new Date()})
            ON CONFLICT ("eventId", "outcomeId", "timestamp") DO NOTHING
          `;
          insertedCount++;
        } catch (insertErr) {
          // Skip duplicates silently (ON CONFLICT should handle most, but race conditions may occur)
          if (!(insertErr instanceof Error && insertErr.message.includes('duplicate'))) {
            console.warn('[Polymarket] odds history row insert failed:', insertErr);
          }
        }
      }
      console.log('[Polymarket] odds history backfill stored via parameterized insert', insertedCount, 'rows for', tokenId, marketId, `(${totalDays.toFixed(1)} days)`);
    }

    // Return the latest probability found in history to seed the current outcome price
    if (rows.length > 0) {
      const sorted = [...rows].sort((a, b) => b.timestampMs - a.timestampMs);
      return sorted[0].probability;
    }

    return undefined;
  } catch (err) {
    console.error('[Polymarket] odds history backfill failed', { tokenId, marketId, err });
    return undefined;
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
  let body: any;
  try {
    await requireAdminAuth(request);
    body = await request.json();
    console.log('[Polymarket Intake] POST approve started', body.polymarketId);
    const {
      polymarketId,
      polymarketConditionId,
      polymarketTokenId,
      internalEventId: incomingInternalEventId,
      outcomeMapping,
      eventData,
      notes,
      updatedBy,
      isGroupedBinary,
      marketType: requestedMarketType,
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

    // Fetch tokens up front to infer multiplicity and for hedging support
    let normalizedOutcomeMapping = Array.isArray(outcomeMapping) ? dedupeOutcomeNames(outcomeMapping) : [];
    const { tokens: marketTokens = [] } = await fetchTokensForMarket(polymarketId);

    const data: any = {
      internalEventId,
      polymarketId,
      polymarketConditionId: polymarketConditionId ?? null,
      polymarketTokenId: tokenIdForLegacy,
      // CRITICAL: Populate yesTokenId and noTokenId for hedging to work
      // marketTokens[0] is typically YES, marketTokens[1] is typically NO for binary events
      yesTokenId: marketTokens[0] || null,
      noTokenId: marketTokens[1] || null,
      isActive: true,
    };

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

    // Ensure Event exists for this mapping and mirror Polymarket info
    // Reuse existing event by internalEventId or polymarketId to avoid unique constraint errors
    const existingEventById = await prisma.event.findUnique({
      where: { id: internalEventId },
    });
    const existingEventByPoly = await prisma.event.findUnique({
      where: { polymarketId },
    });

    // If an event already exists for this polymarketId, align internalEventId to it
    const finalEffectiveEventId = existingEventByPoly?.id || existingEventById?.id || internalEventId;

    const creatorId = await getSystemCreatorId(prisma);
    const fallbackResolutionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const resolutionDateStr =
      eventData?.resolutionDate || eventData?.endDate || eventData?.startDate || fallbackResolutionDate.toISOString();
    const resolutionDate = new Date(resolutionDateStr);

    // Auto-categorize with LLM if title is available
    let llmCategories: string[] = [];
    if (eventData?.title) {
      llmCategories = await categorizeWithLLM(eventData.title);
    }

    const providedCategories = (Array.isArray(eventData?.categories) ? eventData.categories.filter(Boolean) : []);
    // Merge provided and LLM categories, prioritizing LLM if pertinent
    const categories = Array.from(new Set([...providedCategories, ...llmCategories])).slice(0, 5);
    const inferredOutcomeCount = Math.max(normalizedOutcomeMapping.length, marketTokens.length);

    // Determine type: prioritize explicit request, then infer from outcomes
    // GROUPED_BINARY is stored as MULTIPLE in the database (both have multiple outcomes)
    // but the distinction is preserved for UI and future processing
    let type: string;
    if (requestedMarketType === 'GROUPED_BINARY' || isGroupedBinary === true) {
      type = 'GROUPED_BINARY';
    } else if (requestedMarketType === 'MULTIPLE' || requestedMarketType === 'BINARY') {
      type = requestedMarketType;
    } else {
      // Fallback to inference based on outcome count
      type = inferredOutcomeCount > 2 ? 'MULTIPLE' : 'BINARY';
    }

    const status = resolutionDate.getTime() < Date.now() ? 'CLOSED' : 'ACTIVE';
    let imageUrl = eventData?.image || eventData?.imageUrl || null;

    // Upload to Vercel Blob if it's a remote URL to avoid hotlinking dependency
    if (imageUrl && !imageUrl.includes('blob.vercel-storage.com')) {
      try {
        const { uploadEventImageToBlob } = await import('@/lib/event-image-blob');
        const blobUrl = await uploadEventImageToBlob(imageUrl, internalEventId);
        if (blobUrl) {
          imageUrl = blobUrl;
          console.log(`[Polymarket Intake] Uploaded image to Vercel Blob: ${blobUrl}`);
        }
      } catch (uploadErr) {
        console.warn('[Polymarket Intake] Failed to upload image to blob, falling back to original URL', uploadErr);
      }
    }

    // Polymarket's "description" field actually contains resolution rules
    // We store it in the `rules` column and generate a short description via LLM
    const rules = eventData?.rules || eventData?.description || '';
    const title = eventData?.title || `Polymarket ${polymarketId.slice(0, 8)}`;

    // Generate a concise, engaging description using LLM
    let generatedDescription = '';
    if (title) {
      generatedDescription = await generateDescriptionWithLLM(title, rules);
    }

    const baseEventData: any = {
      title,
      description: generatedDescription || '', // LLM-generated short description
      rules: rules || null, // Polymarket's resolution rules
      categories,
      imageUrl,
      resolutionDate,
      status,
      creatorId,
      type,
      source: 'POLYMARKET',
      polymarketId,
      resolutionSource: eventData?.resolutionSource || 'POLYMARKET',
      externalVolume: scaleVolumeForStorage(eventData?.volume ?? 0),
      externalBetCount: eventData?.betCount ?? 0,
      isHidden: false,
    };

    const dbEvent = await prisma.event.upsert({
      where: { polymarketId },
      update: baseEventData,
      create: {
        id: finalEffectiveEventId,
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

    // NOW create or update the mapping since the Event record definitely exists
    // Ensure data.internalEventId matches the actual dbEvent.id
    data.internalEventId = dbEvent.id;
    const mapping = targetId
      ? await prisma.polymarketMarketMapping.update({
        where: { id: targetId },
        data,
      })
      : await prisma.polymarketMarketMapping.create({ data });

    // Bust cached event responses (by id and polymarketId)
    try {
      await invalidate(`evt:${finalEffectiveEventId}`, 'event');
      await invalidate(`poly:${polymarketId}`, 'event');
    } catch {
      // best-effort cache bust
    }

    // Upload event image to Vercel Blob (fire-and-forget for non-blocking)
    // Only upload if we have an external image URL that's not already in Blob
    if (imageUrl && !imageUrl.includes('blob.vercel-storage.com')) {
      (async () => {
        try {
          const { uploadEventImageToBlob } = await import('@/lib/event-image-blob');
          const blobUrl = await uploadEventImageToBlob(imageUrl, dbEvent.id);
          if (blobUrl && blobUrl !== imageUrl) {
            // Update the event with the new Blob URL
            await prisma.event.update({
              where: { id: dbEvent.id },
              data: { imageUrl: blobUrl },
            });
            console.log(`[Polymarket] ✓ Event image uploaded to Blob: ${dbEvent.id}`);
          }
        } catch (imgErr) {
          console.warn('[Polymarket] Image blob upload failed (non-critical):', imgErr);
        }
      })();
    }


    // Trim low-probability outcomes for large Multiple events
    // Rule: If >= 4 outcomes, remove any with < 1% probability, but always keep at least 4 outcomes
    let outcomesFromMapping = normalizedOutcomeMapping;
    if ((type === 'MULTIPLE' || dbEvent.type === 'MULTIPLE') && outcomesFromMapping.length >= 4) {
      const originalCount = outcomesFromMapping.length;

      // Sort by probability descending first
      const sortedOutcomes = [...outcomesFromMapping].sort((a: any, b: any) => {
        const pA = typeof a.probability === 'number' ? a.probability : Number(a.price || 0);
        const pB = typeof b.probability === 'number' ? b.probability : Number(b.price || 0);
        return pB - pA;
      });

      // Filter outcomes with >= 1% probability
      const significantOutcomes = sortedOutcomes.filter((o: any) => {
        const p = typeof o.probability === 'number' ? o.probability : Number(o.price || 0);
        return p >= 0.01;
      });

      // Keep at least 4 outcomes - if filtering removed too many, keep top 4 by probability
      if (significantOutcomes.length >= 4) {
        outcomesFromMapping = significantOutcomes;
      } else {
        // Not enough significant outcomes, keep top 4 regardless of probability
        outcomesFromMapping = sortedOutcomes.slice(0, Math.max(4, significantOutcomes.length));
      }

      if (outcomesFromMapping.length < originalCount) {
        console.log(`[Intake] Trimmed "${dbEvent.title}" outcomes: ${originalCount} -> ${outcomesFromMapping.length}`);
      }
    }
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
      // CRITICAL: Use actual outcome name from mapping, not array position
      let name = o.name || '';
      if (dbEvent.type === 'BINARY') {
        // Check if name already indicates YES/NO
        const isYes = /yes|true|will|affirmative/i.test(name);
        const isNo = /no|false|won't|negative/i.test(name);

        if (isYes) {
          name = 'YES';
        } else if (isNo) {
          name = 'NO';
        } else if (!name || /^outcome$/i.test(name.trim())) {
          // If name is missing/generic, check all outcomes to determine order
          // Look at other outcomes in the mapping to see which is YES/NO
          const otherOutcomes = normalizedOutcomeMapping.filter((other: any, otherIdx: number) => otherIdx !== idx);
          const hasYesOutcome = otherOutcomes.some((other: any) => /yes|true|will/i.test(other.name || ''));
          const hasNoOutcome = otherOutcomes.some((other: any) => /no|false|won't/i.test(other.name || ''));

          // If we can't determine from names, use probability as hint (higher prob = more likely YES for binary)
          if (!hasYesOutcome && !hasNoOutcome && typeof o.probability === 'number') {
            const otherProb = otherOutcomes[0]?.probability;
            if (typeof otherProb === 'number') {
              // Higher probability outcome is typically YES
              name = o.probability > otherProb ? 'YES' : 'NO';
            } else {
              // Fallback to position only if we have no other info
              name = idx === 0 ? 'YES' : 'NO';
            }
          } else {
            // Default to position if we can't determine
            name = idx === 0 ? 'YES' : 'NO';
          }
        }

        // Ensure name is uppercase YES/NO
        if (name.toUpperCase() === 'YES') name = 'YES';
        else if (name.toUpperCase() === 'NO') name = 'NO';
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

      // If we don't have YES/NO outcomes, determine by probability (higher = YES)
      if (!yesOutcome || !noOutcome) {
        // Sort by probability descending - higher probability is typically YES
        const sortedByProb = [...dbOutcomes].sort((a: any, b: any) =>
          (b.probability ?? 0) - (a.probability ?? 0)
        );

        // Higher probability outcome = YES, lower = NO
        if (sortedByProb[0] && !/^(yes|no)$/i.test(sortedByProb[0].name)) {
          await prisma.outcome.update({
            where: { id: sortedByProb[0].id },
            data: { name: 'YES' },
          });
        }
        if (sortedByProb[1] && !/^(yes|no)$/i.test(sortedByProb[1].name)) {
          await prisma.outcome.update({
            where: { id: sortedByProb[1].id },
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

    // Queue async backfill for each mapped outcome/token
    // This makes approval fast - backfill happens in background worker
    const { queueBackfillJob } = await import('@/lib/backfill-queue');

    for (const [idx, o] of outcomesFromMapping.entries()) {
      const name = o.name || `Outcome ${idx + 1}`;
      const mappingPolyId = o.polymarketTokenId || o.polymarketId;
      const outcomeId = (mappingPolyId ? outcomeIdsByPolyId[mappingPolyId] : undefined) || outcomeIdsByName[name];
      if (!outcomeId || !o.polymarketTokenId) continue;

      const marketIdForHistory: string | undefined =
        (o as any)._marketIdForHistory ||
        eventData?.polymarketMarketId ||
        eventData?.polymarketConditionId ||
        eventData?.conditionId ||
        polymarketConditionId ||
        polymarketId;

      // Queue backfill job for background processing
      await queueBackfillJob({
        eventId: dbEvent.id,
        outcomeId,
        tokenId: o.polymarketTokenId,
        marketId: marketIdForHistory,
        polymarketStartDate: eventData?.startDate || eventData?.createdAt,
        probability: typeof o.probability === 'number' ? o.probability : undefined,
      });

      console.log(`[Polymarket] Queued backfill job for ${dbEvent.id}/${outcomeId}`);
    }

    // Notify Polymarket WebSocket client to subscribe to new market tokens (dynamic subscription)
    // This enables real-time price updates without restarting the WS server
    try {
      const { redis } = await import('@/lib/redis');
      if (redis) {
        await redis.publish('new-market-approved', JSON.stringify({
          internalEventId: dbEvent.id,
          polymarketId,
          yesTokenId: mapping.yesTokenId,
          noTokenId: mapping.noTokenId,
        }));
        console.log('[Polymarket] Published new-market-approved event for dynamic subscription');
      }
    } catch (redisErr) {
      // Non-critical: WS will pick up new markets on next restart or via API poll
      console.log('[Polymarket] Redis publish failed (non-critical):', redisErr);
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
    console.error('[Polymarket Intake] approve failed for', body?.polymarketId, error);
    return NextResponse.json(
      { error: 'Failed to approve Polymarket mapping', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

