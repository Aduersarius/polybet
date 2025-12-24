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

const HISTORY_TTL_SECONDS = Math.max(parseInt(process.env.ODDS_HISTORY_TTL || '60', 10), 15);
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

  const [outcomes, rows] = await Promise.all([
    prisma.outcome.findMany({
      where: { eventId },
      select: { id: true, name: true },
    }),
    prisma.oddsHistory.findMany({
      where: { eventId, timestamp: { gte: fromDate } },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  // Deduplicate outcomes based on case-insensitive name matching
  // This handles cases where we have both "Yes" and "YES" or "No" and "NO"
  const outcomeNameToCanonical = new Map<string, { id: string; name: string }>();
  const outcomeIdToCanonical = new Map<string, string>(); // Maps outcome ID to canonical ID

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
      outcomeNameToCanonical.set(normalizedName, { id: o.id, name: canonicalName });
    }
    // Map this outcome ID to the canonical outcome ID
    outcomeIdToCanonical.set(o.id, outcomeNameToCanonical.get(normalizedName)!.id);
  }

  // Create deduplicated outcomes list
  const deduplicatedOutcomes = Array.from(outcomeNameToCanonical.values());
  const isMultiple = deduplicatedOutcomes.length > 2;

  const outcomeNames = new Map<string, string>();
  for (const o of deduplicatedOutcomes) {
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
  return downsample(points, 500);
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