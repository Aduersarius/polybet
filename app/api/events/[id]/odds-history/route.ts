import { NextRequest, NextResponse } from 'next/server';
import { generateHistoricalOdds } from '@/lib/amm-server';
import { getOrSet } from '@/lib/cache';

function downsample<T extends { timestamp: number }>(points: T[], maxPoints = 500): T[] {
  if (points.length <= maxPoints) return points;
  const stride = points.length / maxPoints;
  const result: T[] = [];
  for (let i = 0; i < points.length; i += stride) {
    result.push(points[Math.floor(i)]);
  }
  // Ensure last point present
  if (result[result.length - 1]?.timestamp !== points[points.length - 1]?.timestamp) {
    result[result.length - 1] = points[points.length - 1];
  }
  return result;
}

function toSeconds(ts: number): number {
  const n = Number(ts);
  // Treat anything >= 10^11 as milliseconds (covers 1973-5138 in ms space)
  return n >= 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeTimestamps<T extends { timestamp: number }>(points: T[]): T[] {
  return points.map((p) => ({
    ...p,
    // Force seconds to avoid mixed ms/seconds datasets (legacy caches, ingest)
    timestamp: toSeconds(p.timestamp),
  }));
}

const HISTORY_TTL_SECONDS = Math.max(parseInt(process.env.ODDS_HISTORY_TTL || '300', 10), 15);
const PERIOD_TO_MS: Record<string, number> = {
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
  all: 400 * 24 * 60 * 60 * 1000, // Full year+ of history
};

async function loadPolymarketHistory(eventId: string, period: string) {
  const now = Date.now();
  const duration = PERIOD_TO_MS[period] || PERIOD_TO_MS['1d'];
  const fromDate = new Date(now - duration);

  const { prisma } = await import('@/lib/prisma');

  // 1. Fetch all outcomes with probability to determine significance
  const outcomes = await prisma.outcome.findMany({
    where: { eventId },
    select: { id: true, name: true, probability: true, polymarketOutcomeId: true },
  });

  // Deduplicate outcomes based on case-insensitive name matching
  // This handles cases where we have both "Yes" and "YES" or "No" and "NO"
  const outcomeNameToCanonical = new Map<string, { id: string; name: string; probability: number; polymarketOutcomeId: string | null }>();
  const outcomeIdToCanonical = new Map<string, string>(); // Maps raw outcome ID to canonical ID

  for (const o of outcomes) {
    const normalizedName = o.name.toLowerCase();
    // Normalize YES/NO to uppercase for binary markets
    let canonicalName = o.name;
    if (/^yes$/i.test(o.name)) {
      canonicalName = 'YES';
    } else if (/^no$/i.test(o.name)) {
      canonicalName = 'NO';
    }

    if (!outcomeNameToCanonical.has(normalizedName)) {
      outcomeNameToCanonical.set(normalizedName, { id: o.id, name: canonicalName, probability: o.probability, polymarketOutcomeId: o.polymarketOutcomeId });
    }
    // Map this outcome ID to the canonical outcome ID
    outcomeIdToCanonical.set(o.id, outcomeNameToCanonical.get(normalizedName)!.id);
  }

  // Create deduplicated outcomes list
  const allDeduplicatedOutcomes = Array.from(outcomeNameToCanonical.values());
  const isMultiple = allDeduplicatedOutcomes.length > 2;

  // Filter significant outcomes: >= 1% or top 4 (same as intake logic)
  allDeduplicatedOutcomes.sort((a, b) => b.probability - a.probability);

  let significantOutcomes = allDeduplicatedOutcomes.filter(o => o.probability >= 0.01);
  if (significantOutcomes.length < 4) {
    significantOutcomes = allDeduplicatedOutcomes.slice(0, 4);
  } else if (significantOutcomes.length > 12) {
    // Cap to top 12 outcomes for performance and chart readability
    significantOutcomes = significantOutcomes.slice(0, 12);
  }

  const significantCanonicalIds = new Set(significantOutcomes.map(o => o.id));

  // Determine which raw outcome IDs we need to fetch history for
  // We need rows for any ID that maps to a significant canonical ID
  const idsToFetch: string[] = [];
  for (const [rawId, canonicalId] of outcomeIdToCanonical.entries()) {
    if (significantCanonicalIds.has(canonicalId)) {
      idsToFetch.push(rawId);
    }
  }

  // 2. Fetch history for significant outcomes
  // For longer periods (>1 week), use the hourly aggregated materialized view
  // This reduces data volume by ~28x and improves query performance significantly
  const MAX_ROWS = 50000;
  const useHourlyView = duration > 7 * 24 * 60 * 60 * 1000; // More than 1 week

  let rows: Array<{
    id?: string;
    outcomeId: string;
    timestamp: Date;
    probability: number;
  }>;

  if (useHourlyView && idsToFetch.length > 0) {
    // Trigger background refresh if the materialized view is stale
    // This is fire-and-forget, doesn't block the current request
    const { triggerBackgroundRefresh } = await import('@/lib/odds-history-refresh');
    triggerBackgroundRefresh();

    // Use the pre-aggregated hourly materialized view for long periods
    const hourlyRows = await prisma.$queryRaw<Array<{
      eventId: string;
      outcomeId: string;
      bucketTime: Date;
      avgProbability: number;
    }>>`
      SELECT 
        "eventId",
        "outcomeId",
        "bucketTime",
        "avgProbability"
      FROM "OddsHistoryHourly"
      WHERE "eventId" = ${eventId}
        AND "bucketTime" >= ${fromDate}
        AND "outcomeId" = ANY(${idsToFetch}::text[])
      ORDER BY "bucketTime" ASC
      LIMIT ${MAX_ROWS}
    `;

    rows = hourlyRows.map((r: { outcomeId: string; bucketTime: Date; avgProbability: number }) => ({
      outcomeId: r.outcomeId,
      timestamp: r.bucketTime,
      probability: r.avgProbability,
    }));
  } else {
    // For shorter periods, fetch full resolution data
    rows = await prisma.oddsHistory.findMany({
      where: {
        eventId,
        timestamp: { gte: fromDate },
        outcomeId: { in: idsToFetch }
      },
      orderBy: { timestamp: 'asc' },
      take: MAX_ROWS,
      select: {
        id: true,
        outcomeId: true,
        timestamp: true,
        probability: true,
      }
    });
  }

  const outcomeNames = new Map<string, string>();
  for (const o of allDeduplicatedOutcomes) {
    outcomeNames.set(o.id, o.name);
  }

  const byTs = new Map<number, any>();
  for (const row of rows) {
    const ts = Math.floor(row.timestamp.getTime() / 1000);
    if (!byTs.has(ts)) {
      byTs.set(ts, {
        timestamp: ts,
        outcomes: [] as any[],
        yesPrice: undefined as number | undefined,
        noPrice: undefined as number | undefined,
      });
    }
    const entry = byTs.get(ts);

    // Use canonical outcome ID for deduplication
    const canonicalOutcomeId = outcomeIdToCanonical.get(row.outcomeId) || row.outcomeId;
    const outcomeName = outcomeNames.get(canonicalOutcomeId) || row.outcomeId;

    // Check if we already have this outcome in this timestamp's outcomes array
    const existingOutcome = entry.outcomes.find((o: any) => o.id === canonicalOutcomeId);
    if (!existingOutcome) {
      entry.outcomes.push({
        id: canonicalOutcomeId,
        name: outcomeName,
        probability: row.probability,
      });
    } else if (existingOutcome.probability === 0 && row.probability !== 0) {
      // If existing outcome has 0 probability, prefer non-zero value
      existingOutcome.probability = row.probability;
    }

    // Only derive yes/no helpers for binary markets
    if (!isMultiple) {
      const name = outcomeName;
      if (/yes/i.test(name)) {
        entry.yesPrice = row.probability;
      } else if (/no/i.test(name)) {
        entry.noPrice = row.probability;
      }
    }
  }

  const points = Array.from(byTs.values())
    .map((p) => {
      // Binary only: derive missing side to avoid random flips.
      if (!isMultiple) {
        if (p.yesPrice == null && typeof p.noPrice === 'number') {
          p.yesPrice = 1 - p.noPrice;
        }
        if (p.noPrice == null && typeof p.yesPrice === 'number') {
          p.noPrice = 1 - p.yesPrice;
        }
      }
      return p;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // 3. Fetch LIVE prices from Polymarket CLOB API and append as latest point
  // This ensures charts always show the current price, not stale 30-min bucket data
  try {
    const livePoint = await fetchLivePolymarketPrices(significantOutcomes, isMultiple);
    if (livePoint) {
      // Only add if it's more recent than the last historical point
      const lastTs = points.length > 0 ? points[points.length - 1].timestamp : 0;
      if (livePoint.timestamp > lastTs) {
        points.push(livePoint);
      }
    }
  } catch (err) {
    // Non-critical: if live fetch fails, just return historical data
    console.warn('[OddsHistory] Live price fetch failed (using historical only):', err);
  }

  return downsample(points, 500);
}

/**
 * Maximum spread allowed between bid/ask to trust the mid-price.
 * A spread of 0.50 means bid=0.01, ask=0.51 would be rejected.
 * This prevents garbage 50/50 mid-prices from thin orderbooks.
 */
const MAX_ALLOWED_SPREAD = 0.30; // 30% max spread

/**
 * Maximum deviation allowed from the last known price.
 * Prevents sudden spikes from orderbook manipulation or stale data.
 */
const MAX_PRICE_DEVIATION = 0.25; // 25% max deviation

/**
 * Fetch live prices directly from Polymarket CLOB API orderbook
 * Returns a single point with current timestamp and mid-prices for each outcome
 * 
 * IMPORTANT: This function validates orderbook quality to prevent garbage data:
 * 1. Requires BOTH bid AND ask to be present (no one-sided books)
 * 2. Spread must be <= MAX_ALLOWED_SPREAD (rejects thin books like 0.01/0.99)
 * 3. Price deviation from last known must be <= MAX_PRICE_DEVIATION (prevents spikes)
 */
async function fetchLivePolymarketPrices(
  outcomes: Array<{ id: string; name: string; probability: number; polymarketOutcomeId: string | null }>,
  isMultiple: boolean
): Promise<{ timestamp: number; outcomes: any[]; yesPrice?: number; noPrice?: number } | null> {
  const CLOB_API = 'https://clob.polymarket.com';
  const nowTs = Math.floor(Date.now() / 1000);

  const liveOutcomes: any[] = [];
  let yesPrice: number | undefined;
  let noPrice: number | undefined;

  // Fetch orderbook for each outcome's token ID
  for (const outcome of outcomes) {
    if (!outcome.polymarketOutcomeId) continue;

    try {
      const res = await fetch(`${CLOB_API}/book?token_id=${encodeURIComponent(outcome.polymarketOutcomeId)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3000), // 3s timeout per request
      });

      if (!res.ok) continue;

      const data = await res.json();
      const bids = Array.isArray(data?.bids) ? data.bids : [];
      const asks = Array.isArray(data?.asks) ? data.asks : [];

      // Parse best bid/ask
      const bestBid = bids.length > 0 ? parseFloat(bids[0]?.price ?? '0') : undefined;
      const bestAsk = asks.length > 0 ? parseFloat(asks[0]?.price ?? '0') : undefined;

      // VALIDATION 1: Require BOTH bid AND ask to exist
      // One-sided orderbooks (only bids OR only asks) produce unreliable prices
      if (bestBid === undefined || bestAsk === undefined) {
        console.warn(`[OddsHistory] Skipping ${outcome.name}: one-sided orderbook (bid=${bestBid}, ask=${bestAsk})`);
        continue;
      }

      // VALIDATION 2: Check spread is reasonable
      // Wide spreads (e.g., 0.01/0.99) produce garbage mid-prices around 0.50
      const spread = bestAsk - bestBid;
      if (spread > MAX_ALLOWED_SPREAD) {
        console.warn(`[OddsHistory] Skipping ${outcome.name}: spread too wide (${(spread * 100).toFixed(1)}% > ${(MAX_ALLOWED_SPREAD * 100)}%)`);
        continue;
      }

      // Calculate mid-price
      const midPrice = (bestBid + bestAsk) / 2;

      if (!Number.isFinite(midPrice)) continue;

      // VALIDATION 3: Check deviation from last known price
      // Prevents sudden spikes from orderbook manipulation or stale data
      const lastKnownPrice = outcome.probability; // From database
      const deviation = Math.abs(midPrice - lastKnownPrice);
      if (deviation > MAX_PRICE_DEVIATION) {
        console.warn(`[OddsHistory] Skipping ${outcome.name}: price deviation too large (${(deviation * 100).toFixed(1)}% > ${(MAX_PRICE_DEVIATION * 100)}%). Live=${(midPrice * 100).toFixed(1)}%, DB=${(lastKnownPrice * 100).toFixed(1)}%`);
        continue;
      }

      const clampedPrice = Math.max(0, Math.min(1, midPrice));
      liveOutcomes.push({
        id: outcome.id,
        name: outcome.name,
        probability: clampedPrice,
      });

      // Track yes/no for binary markets
      if (!isMultiple) {
        if (/yes/i.test(outcome.name)) {
          yesPrice = clampedPrice;
        } else if (/no/i.test(outcome.name)) {
          noPrice = clampedPrice;
        }
      }
    } catch {
      // Skip this outcome on error, continue with others
    }
  }

  if (liveOutcomes.length === 0) return null;

  // For binary markets, derive missing side
  if (!isMultiple) {
    if (yesPrice == null && typeof noPrice === 'number') {
      yesPrice = 1 - noPrice;
    }
    if (noPrice == null && typeof yesPrice === 'number') {
      noPrice = 1 - yesPrice;
    }
  }

  return {
    timestamp: nowTs,
    outcomes: liveOutcomes,
    yesPrice,
    noPrice,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const { id: eventId } = await params;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '24h';

    // Bump cache version to invalidate any legacy ms-timestamp entries
    const data = await getOrSet(
      `${eventId}:${period}:tsv2`,
      async () => {
        const event = await prisma.event.findUnique({
          where: { id: eventId },
          select: { id: true, source: true },
        });

        if (!event) return [];

        if (event.source === 'POLYMARKET') {
          const history = await loadPolymarketHistory(eventId, period);
          return history;
        }

        // Use real historical odds for local events
        const oddsHistory = await generateHistoricalOdds(eventId, period);
        return downsample(oddsHistory);
      },
      { ttl: HISTORY_TTL_SECONDS, prefix: 'odds-history' },
    );

    const res = NextResponse.json({
      eventId,
      period,
      data: normalizeTimestamps(Array.isArray(data) ? data : []),
    });

    // Cache on the edge/CDN while keeping data reasonably fresh for realtime charts.
    res.headers.set('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=300');

    return res;
  } catch (error) {
    console.error('Error fetching odds history:', error);
    return NextResponse.json({ error: 'Failed to fetch odds history' }, { status: 500 });
  }
}