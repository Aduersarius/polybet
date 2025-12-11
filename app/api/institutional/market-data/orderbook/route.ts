export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, hasPermission, checkInstitutionalRateLimit } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

interface OrderBookLevel {
  price: number;
  amount: number; // Total amount at this price level
  orderCount: number; // Number of orders at this price level
}

interface OrderBook {
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  bids: OrderBookLevel[]; // Buy orders, sorted by price descending (highest first)
  asks: OrderBookLevel[]; // Sell orders, sorted by price ascending (lowest first)
  spread: number; // Difference between best ask and best bid
  midPrice: number; // Midpoint between best bid and best ask
  timestamp: string; // ISO 8601 timestamp
}

// Helper function to generate cache key
function getCacheKey(eventId: string, outcomeId?: string, option?: string, depth?: number): string {
  const params = [eventId, outcomeId || '', option || '', depth?.toString() || ''];
  return `orderbook:${params.join(':')}`;
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

    // Optional filters
    const outcomeId = searchParams.get('outcomeId');
    const option = searchParams.get('option');

    // Depth parameter (max 50, default 20)
    const depth = Math.min(Math.max(parseInt(searchParams.get('depth') || '20'), 1), 50);

    // Validate option parameter
    if (option && option !== 'YES' && option !== 'NO') {
      return NextResponse.json({ error: 'Invalid option parameter. Must be "YES" or "NO"' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = getCacheKey(eventId, outcomeId || undefined, option || undefined, depth);
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

    // Build where clause for Orders
    const where: any = {
      eventId,
      status: { in: ['open', 'partially_filled'] }, // Only active orders
    };

    if (outcomeId) {
      where.outcomeId = outcomeId;
    }

    if (option) {
      where.option = option;
    }

    // Get all active orders
    const orders = await prisma.order.findMany({
      where,
      select: {
        side: true,
        price: true,
        amount: true,
        amountFilled: true,
      },
    });

    // Aggregate orders by price level
    const bidsMap = new Map<number, { amount: number; orderCount: number }>();
    const asksMap = new Map<number, { amount: number; orderCount: number }>();

    for (const order of orders) {
      if (!order.price) continue;

      const remainingAmount = order.amount - (order.amountFilled || 0);
      if (remainingAmount <= 0) continue;

      const map = order.side === 'buy' ? bidsMap : asksMap;

      if (!map.has(order.price)) {
        map.set(order.price, { amount: 0, orderCount: 0 });
      }

      const level = map.get(order.price)!;
      level.amount += remainingAmount;
      level.orderCount += 1;
    }

    // Convert to sorted arrays
    const bids: OrderBookLevel[] = Array.from(bidsMap.entries())
      .map(([price, data]) => ({
        price,
        amount: data.amount,
        orderCount: data.orderCount,
      }))
      .sort((a, b) => b.price - a.price) // Highest price first
      .slice(0, depth);

    const asks: OrderBookLevel[] = Array.from(asksMap.entries())
      .map(([price, data]) => ({
        price,
        amount: data.amount,
        orderCount: data.orderCount,
      }))
      .sort((a, b) => a.price - b.price) // Lowest price first
      .slice(0, depth);

    // Calculate spread and midPrice
    let spread = 0;
    let midPrice = 0;

    if (bids.length > 0 && asks.length > 0) {
      const bestBid = bids[0].price;
      const bestAsk = asks[0].price;
      spread = bestAsk - bestBid;
      midPrice = (bestBid + bestAsk) / 2;
    } else if (bids.length > 0) {
      // Only bids, use best bid as midPrice
      midPrice = bids[0].price;
    } else if (asks.length > 0) {
      // Only asks, use best ask as midPrice
      midPrice = asks[0].price;
    }

    const orderBook: OrderBook = {
      eventId,
      outcomeId: outcomeId || undefined,
      option: option as 'YES' | 'NO' | undefined,
      bids,
      asks,
      spread,
      midPrice,
      timestamp: new Date().toISOString(),
    };

    // Cache the response (2 seconds TTL)
    if (redis) {
      try {
        await redis.setex(cacheKey, 2, JSON.stringify(orderBook));
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError);
        // Continue without caching
      }
    }

    return NextResponse.json(orderBook);

  } catch (error) {
    console.error('Error fetching order book:', error);

    if (error instanceof Response) {
      return error; // Already formatted error response
    }

    return NextResponse.json({
      error: 'Failed to fetch order book',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}