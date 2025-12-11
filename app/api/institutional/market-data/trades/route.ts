export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, hasPermission, checkInstitutionalRateLimit } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

interface Trade {
  id: string;
  eventId: string;
  outcomeId?: string;
  option?: 'YES' | 'NO';
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  volume: number; // price * amount
  timestamp: string; // ISO 8601
  isAmmTrade: boolean;
  makerUserId?: string;
  takerUserId: string;
  orderId?: string;
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

    // Required parameter: eventId
    const eventId = searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'eventId parameter is required' }, { status: 400 });
    }

    // Optional filters
    const outcomeId = searchParams.get('outcomeId');
    const option = searchParams.get('option');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');

    // Pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Sorting
    const sort = searchParams.get('sort') || 'desc';
    if (sort !== 'asc' && sort !== 'desc') {
      return NextResponse.json({ error: 'Invalid sort parameter. Must be "asc" or "desc"' }, { status: 400 });
    }

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

    // Build where clause for MarketActivity
    const where: any = {
      eventId,
      type: { in: ['TRADE', 'ORDER_FILL'] }, // Only trade-related activities
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

    // Get trades with pagination and sorting
    const marketActivities = await prisma.marketActivity.findMany({
      where,
      select: {
        id: true,
        eventId: true,
        outcomeId: true,
        option: true,
        side: true,
        amount: true,
        price: true,
        isAmmInteraction: true,
        orderId: true,
        userId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: sort === 'asc' ? 'asc' : 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Transform to Trade interface format
    const trades: Trade[] = marketActivities.map((activity: (typeof marketActivities)[number]) => ({
      id: activity.id,
      eventId: activity.eventId,
      outcomeId: activity.outcomeId || undefined,
      option: activity.option as 'YES' | 'NO' | undefined,
      side: activity.side as 'buy' | 'sell',
      price: activity.price || 0,
      amount: activity.amount,
      volume: (activity.price || 0) * activity.amount,
      timestamp: activity.createdAt.toISOString(),
      isAmmTrade: activity.isAmmInteraction,
      takerUserId: activity.userId,
      orderId: activity.orderId || undefined,
      // makerUserId would require additional logic to determine from order executions
    }));

    // Get total count for pagination
    const totalCount = await prisma.marketActivity.count({ where });

    return NextResponse.json({
      trades,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });

  } catch (error) {
    console.error('Error fetching trades:', error);

    if (error instanceof Response) {
      return error; // Already formatted error response
    }

    return NextResponse.json({
      error: 'Failed to fetch trades',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}