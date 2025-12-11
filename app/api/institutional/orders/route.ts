export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, checkInstitutionalRateLimit, hasPermission } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    // Authenticate API key
    const auth = await requireApiKeyAuth(request);

    // Require read or trade capability
    const canRead = hasPermission(auth, 'read') || hasPermission(auth, 'trade');
    if (!canRead) {
      return NextResponse.json({ error: 'Insufficient permissions. Read access required.' }, { status: 403 });
    }

    // Check rate limit
    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 100, 60000); // 100 requests per minute
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const eventId = searchParams.get('eventId');
    const side = searchParams.get('side');
    const orderType = searchParams.get('orderType');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: Prisma.OrderWhereInput = {
      userId: auth.userId,
    };

    if (status) {
      where.status = status;
    }

    if (eventId) {
      where.eventId = eventId;
    }

    if (side) {
      where.side = side;
    }

    if (orderType) {
      where.orderType = orderType;
    }

    const orderSelect = {
      id: true,
      eventId: true,
      outcomeId: true,
      option: true,
      side: true,
      price: true,
      amount: true,
      amountFilled: true,
      status: true,
      orderType: true,
      visibleAmount: true,
      totalAmount: true,
      timeWindow: true,
      totalDuration: true,
      executedSlices: true,
      stopPrice: true,
      stopType: true,
      batchId: true,
      createdAt: true,
      updatedAt: true,
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          resolutionDate: true,
        },
      },
      outcome: {
        select: {
          id: true,
          name: true,
        },
      },
      executions: {
        select: {
          amount: true,
          price: true,
          executedAt: true,
        },
        orderBy: {
          executedAt: 'desc',
        },
      },
      _count: {
        select: {
          executions: true,
        },
      },
    } as const;

    // Get orders with execution summary
    const orders: Prisma.OrderGetPayload<{ select: typeof orderSelect }>[] = await prisma.order.findMany({
      where,
      select: orderSelect,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Calculate execution summary for each order
    const ordersWithSummary = orders.map(order => {
      const executions = order.executions;
      const totalExecuted = executions.reduce((sum, exec) => sum + exec.amount, 0);
      const avgExecutionPrice = executions.length > 0
        ? executions.reduce((sum, exec) => sum + (exec.amount * exec.price), 0) / totalExecuted
        : 0;

      return {
        id: order.id,
        eventId: order.eventId,
        eventTitle: order.event.title,
        eventStatus: order.event.status,
        outcomeId: order.outcomeId,
        outcomeName: order.outcome?.name,
        option: order.option,
        side: order.side,
        price: order.price,
        amount: order.amount,
        amountFilled: order.amountFilled,
        status: order.status,
        orderType: order.orderType,
        visibleAmount: order.visibleAmount,
        totalAmount: order.totalAmount,
        timeWindow: order.timeWindow,
        totalDuration: order.totalDuration,
        executedSlices: order.executedSlices,
        stopPrice: order.stopPrice,
        stopType: order.stopType,
        batchId: order.batchId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Execution summary
        executionCount: order._count.executions,
        totalExecuted,
        avgExecutionPrice,
        remainingAmount: order.amount - order.amountFilled,
        lastExecution: executions[0]?.executedAt || null,
      };
    });

    // Get total count for pagination
    const totalCount = await prisma.order.count({ where });

    return NextResponse.json({
      orders: ordersWithSummary,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });

  } catch (error) {
    console.error('Error fetching orders:', error);

    if (error instanceof Response) {
      return error; // Already formatted error response
    }

    return NextResponse.json({
      error: 'Failed to fetch orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}