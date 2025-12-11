export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, hasPermission, checkInstitutionalRateLimit } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

interface OHLCBar {
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  timestamp: string; // ISO 8601, start of interval
  interval: string; // '1m', '5m', etc.
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Total volume in interval
  trades: number; // Number of trades in interval
}

// Time interval configurations
const INTERVAL_CONFIGS = {
  '1m': { minutes: 1, ttlSeconds: 30 },
  '5m': { minutes: 5, ttlSeconds: 150 }, // 2.5 minutes
  '15m': { minutes: 15, ttlSeconds: 450 }, // 7.5 minutes
  '1h': { minutes: 60, ttlSeconds: 1800 }, // 30 minutes
  '4h': { minutes: 240, ttlSeconds: 7200 }, // 2 hours
  '1d': { minutes: 1440, ttlSeconds: 43200 }, // 12 hours
};

// Helper function to get interval start timestamp
function getIntervalStart(timestamp: Date, intervalMinutes: number): Date {
  const ms = timestamp.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(ms / intervalMs) * intervalMs);
}

// Helper function to generate cache key
function getCacheKey(eventId: string, outcomeId?: string, option?: string, interval?: string, startTime?: string, endTime?: string, limit?: number): string {
  const params = [eventId, outcomeId || '', option || '', interval || '', startTime || '', endTime || '', limit?.toString() || ''];
  return `ohlc:${params.join(':')}`;
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate API key
    const auth = await requireApiKeyAuth(request);

    // Check permissions
    if (!hasPermission(auth, 'read')) {
      return NextResponse.json({ error: 'Insufficient permissions. Read access required.' }, { status: 403 });
    }

    // Check rate limit (1000 req/min, burst 100)
    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 1000, 60000); // 1000 requests per minute
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    const { searchParams } = new URL(request.url);

    // Required parameters
    const eventId = searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'eventId parameter is required' }, { status: 400 });
    }

    const interval = searchParams.get('interval');
    if (!interval || !INTERVAL_CONFIGS[interval as keyof typeof INTERVAL_CONFIGS]) {
      return NextResponse.json({
        error: 'Invalid or missing interval parameter. Must be one of: 1m, 5m, 15m, 1h, 4h, 1d'
      }, { status: 400 });
    }

    // Optional filters
    const outcomeId = searchParams.get('outcomeId');
    const option = searchParams.get('option');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');

    // Pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);

    // Validate option parameter
    if (option && option !== 'YES' && option !== 'NO') {
      return NextResponse.json({ error: 'Invalid option parameter. Must be "YES" or "NO"' }, { status: 400 });
    }

    // Validate time parameters
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (startTime) {
      startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Invalid startTime format. Use ISO 8601' }, { status: 400 });
      }
    }

    if (endTime) {
      endDate = new Date(endTime);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid endTime format. Use ISO 8601' }, { status: 400 });
      }
    }

    // Check cache first
    const cacheKey = getCacheKey(eventId, outcomeId || undefined, option || undefined, interval, startTime || undefined, endTime || undefined, limit);
    if (redis) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return NextResponse.json(JSON.parse(cachedData));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError);
        // Continue without cache
      }
    }

    // Build where clause for MarketActivity
    const where: any = {
      eventId,
      type: { in: ['TRADE', 'ORDER_FILL'] }, // Only trade-related activities
      price: { not: null }, // Must have price for OHLC
    };

    if (outcomeId) {
      where.outcomeId = outcomeId;
    }

    if (option) {
      where.option = option;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    // Get trades for OHLC calculation
    const marketActivities = await prisma.marketActivity.findMany({
      where,
      select: {
        eventId: true,
        outcomeId: true,
        option: true,
        price: true,
        amount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc', // Need chronological order for OHLC
      },
    });

    // Aggregate into OHLC bars
    const barsMap = new Map<string, {
      timestamp: Date;
      prices: number[];
      volume: number;
      trades: number;
    }>();

    const intervalConfig = INTERVAL_CONFIGS[interval as keyof typeof INTERVAL_CONFIGS];

    for (const activity of marketActivities) {
      if (!activity.price) continue;

      const intervalStart = getIntervalStart(activity.createdAt, intervalConfig.minutes);
      const key = intervalStart.toISOString();

      if (!barsMap.has(key)) {
        barsMap.set(key, {
          timestamp: intervalStart,
          prices: [],
          volume: 0,
          trades: 0,
        });
      }

      const bar = barsMap.get(key)!;
      bar.prices.push(activity.price);
      bar.volume += activity.price * activity.amount;
      bar.trades += 1;
    }

    // Convert to OHLC bars
    const rawBars = Array.from(barsMap.entries()).map<OHLCBar | null>(([timestampStr, bar]) => {
      if (bar.prices.length === 0) return null;

      return {
        eventId,
        outcomeId: outcomeId || undefined,
        option: option as 'YES' | 'NO' | undefined,
        timestamp: timestampStr,
        interval,
        open: bar.prices[0],
        high: Math.max(...bar.prices),
        low: Math.min(...bar.prices),
        close: bar.prices[bar.prices.length - 1],
        volume: bar.volume,
        trades: bar.trades,
      };
    });

    // Sort by timestamp ascending and take most recent bars
    const bars: OHLCBar[] = rawBars
      .filter((bar): bar is OHLCBar => bar !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-limit);

    const response = {
      bars,
      pagination: {
        total: bars.length,
        limit,
        count: bars.length,
      },
    };

    // Cache the response
    if (redis) {
      try {
        await redis.setex(cacheKey, intervalConfig.ttlSeconds, JSON.stringify(response));
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError);
        // Continue without caching
      }
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching OHLC data:', error);

    if (error instanceof Response) {
      return error; // Already formatted error response
    }

    return NextResponse.json({
      error: 'Failed to fetch OHLC data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}