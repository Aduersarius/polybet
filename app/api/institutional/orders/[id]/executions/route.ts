export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, checkInstitutionalRateLimit, hasPermission } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireApiKeyAuth(request);

    // Require read or trade capability
    const canRead = hasPermission(auth, 'read') || hasPermission(auth, 'trade');
    if (!canRead) {
      return NextResponse.json({ error: 'Insufficient permissions. Read access required.' }, { status: 403 });
    }

    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 100, 60000);
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Verify order belongs to user
    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
      select: {
        id: true,
        eventId: true,
        side: true,
        amount: true,
        amountFilled: true,
        status: true,
        orderType: true,
        createdAt: true,
        event: {
          select: {
            title: true,
          },
        },
        outcome: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get executions
    const executions = await prisma.orderExecution.findMany({
      where: {
        orderId: id,
      },
      orderBy: {
        executedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Calculate summary statistics
    const totalExecuted = executions.reduce((sum, exec) => sum + exec.amount, 0);
    const totalValue = executions.reduce((sum, exec) => sum + (exec.amount * exec.price), 0);
    const avgExecutionPrice = executions.length > 0 ? totalValue / totalExecuted : 0;
    const minPrice = executions.length > 0 ? Math.min(...executions.map(e => e.price)) : 0;
    const maxPrice = executions.length > 0 ? Math.max(...executions.map(e => e.price)) : 0;

    // Get total count for pagination
    const totalCount = await prisma.orderExecution.count({
      where: { orderId: id },
    });

    return NextResponse.json({
      order: {
        id: order.id,
        eventTitle: order.event.title,
        outcomeName: order.outcome?.name,
        side: order.side,
        amount: order.amount,
        amountFilled: order.amountFilled,
        status: order.status,
        orderType: order.orderType,
        createdAt: order.createdAt,
      },
      executions,
      summary: {
        totalExecutions: totalCount,
        totalExecuted,
        totalValue,
        avgExecutionPrice,
        minPrice,
        maxPrice,
        remainingAmount: order.amount - order.amountFilled,
        fillPercentage: order.amount > 0 ? (order.amountFilled / order.amount) * 100 : 0,
      },
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });

  } catch (error) {
    console.error('Error fetching order executions:', error);

    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json({
      error: 'Failed to fetch order executions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}