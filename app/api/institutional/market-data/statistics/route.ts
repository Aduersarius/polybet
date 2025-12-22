export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, hasPermission, checkInstitutionalRateLimit } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

interface MarketStatistics {
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  period: string;
  volume: number; // Total volume traded
  trades: number; // Number of trades
  high: number; // Highest price
  low: number; // Lowest price
  open: number; // First price of period
  close: number; // Last price of period
  vwap: number; // Volume Weighted Average Price
  volatility: number; // Price volatility (standard deviation)
  liquidity: number; // Available liquidity from order book
  timestamp: string; // ISO 8601 timestamp
}

// Period configurations in hours
const PERIOD_CONFIGS = {
  '1h': { hours: 1, ttlSeconds: 60 }, // 1 minute TTL
  '24h': { hours: 24, ttlSeconds: 300 }, // 5 minutes TTL
  '7d': { hours: 168, ttlSeconds: 1800 }, // 30 minutes TTL
  '30d': { hours: 720, ttlSeconds: 3600 }, // 1 hour TTL
};

// Helper function to generate cache key
function getCacheKey(eventId: string, outcomeId?: string, option?: string, period?: string): string {
  const params = [eventId, outcomeId || '', option || '', period || ''];
  return `market_stats:${params.join(':')}`;
}

// Helper function to calculate standard deviation
function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

// Helper function to calculate VWAP
function calculateVWAP(activities: Array<{ price: number; amount: number }>): number {
  if (activities.length === 0) return 0;

  let totalVolume = 0;
  let totalVolumePrice = 0;

  for (const activity of activities) {
    if (activity.price && activity.amount) {
      totalVolume += activity.amount;
      totalVolumePrice += activity.price * activity.amount;
    }
  }

  return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
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
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 1000, 60000);
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

    // Optional filters
    const outcomeId = searchParams.get('outcomeId');
    const option = searchParams.get('option');

    // Period parameter with default '24h'
    const period = searchParams.get('period') || '24h';
    if (!PERIOD_CONFIGS[period as keyof typeof PERIOD_CONFIGS]) {
      return NextResponse.json({
        error: 'Invalid period parameter. Must be one of: 1h, 24h, 7d, 30d'
      }, { status: 400 });
    }

    // Validate option parameter
    if (option && option !== 'YES' && option !== 'NO') {
      return NextResponse.json({ error: 'Invalid option parameter. Must be "YES" or "NO"' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = getCacheKey(eventId, outcomeId || undefined, option || undefined, period);
    if (redis && (redis as any).status === 'ready') {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return NextResponse.json(JSON.parse(cachedData));
        }
      } catch (cacheError: any) {
        const isConnectionError = cacheError?.message?.includes('Connection is closed') || 
                                  cacheError?.message?.includes('connect') ||
                                  cacheError?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';
        if (!isConnectionError || isProd) {
          console.warn('Cache read error:', cacheError);
        }
        // Continue without cache
      }
    }

    const periodConfig = PERIOD_CONFIGS[period as keyof typeof PERIOD_CONFIGS];
    const startTime = new Date(Date.now() - (periodConfig.hours * 60 * 60 * 1000));

    // Build where clause for MarketActivity
    const where: any = {
      eventId,
      type: { in: ['TRADE', 'ORDER_FILL'] }, // Only trade-related activities
      price: { not: null }, // Must have price
      createdAt: {
        gte: startTime,
      },
    };

    if (outcomeId) {
      where.outcomeId = outcomeId;
    }

    if (option) {
      where.option = option;
    }

    // Get market activities for the period
    const marketActivities = await prisma.marketActivity.findMany({
      where,
      select: {
        price: true,
        amount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate statistics
    let volume = 0;
    let trades = 0;
    const prices: number[] = [];
    let open: number | null = null;
    let close: number | null = null;
    let high: number | null = null;
    let low: number | null = null;

    for (const activity of marketActivities) {
      if (!activity.price) continue;

      trades += 1;
      volume += activity.amount;
      prices.push(activity.price);

      if (open === null) {
        open = activity.price;
      }
      close = activity.price;

      if (high === null || activity.price > high) {
        high = activity.price;
      }
      if (low === null || activity.price < low) {
        low = activity.price;
      }
    }

    // Calculate VWAP and volatility
    const vwap = calculateVWAP(
        marketActivities
            .filter((a: (typeof marketActivities)[number]) => a.price !== null)
            .map((a: (typeof marketActivities)[number]) => ({ price: a.price!, amount: a.amount }))
    );
    const volatility = calculateStandardDeviation(prices);

    // Get available liquidity from order book
    const orderWhere: any = {
      eventId,
      status: { in: ['open', 'partially_filled'] },
    };

    if (outcomeId) {
      orderWhere.outcomeId = outcomeId;
    }

    if (option) {
      orderWhere.option = option;
    }

    const activeOrders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        amount: true,
        amountFilled: true,
      },
    });

    let liquidity = 0;
    for (const order of activeOrders) {
      const remainingAmount = order.amount - (order.amountFilled || 0);
      if (remainingAmount > 0) {
        liquidity += remainingAmount;
      }
    }

    const statistics: MarketStatistics = {
      eventId,
      outcomeId: outcomeId || undefined,
      option: option as 'YES' | 'NO' | undefined,
      period,
      volume,
      trades,
      high: high || 0,
      low: low || 0,
      open: open || 0,
      close: close || 0,
      vwap,
      volatility,
      liquidity,
      timestamp: new Date().toISOString(),
    };

    // Cache the response
    if (redis && (redis as any).status === 'ready') {
      try {
        await redis.setex(cacheKey, periodConfig.ttlSeconds, JSON.stringify(statistics));
      } catch (cacheError: any) {
        const isConnectionError = cacheError?.message?.includes('Connection is closed') || 
                                  cacheError?.message?.includes('connect') ||
                                  cacheError?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';
        if (!isConnectionError || isProd) {
          console.warn('Cache write error:', cacheError);
        }
        // Continue without caching
      }
    }

    return NextResponse.json(statistics);

  } catch (error) {
    console.error('Error fetching market statistics:', error);

    if (error instanceof Response) {
      return error; // Already formatted error response
    }

    return NextResponse.json({
      error: 'Failed to fetch market statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}