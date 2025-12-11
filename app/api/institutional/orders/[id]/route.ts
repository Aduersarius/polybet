export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, checkInstitutionalRateLimit } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

interface ModifyOrderRequest {
  price?: number;
  amount?: number;
  // Advanced order modifications
  visibleAmount?: number;
  timeWindow?: number;
  totalDuration?: number;
  stopPrice?: number;
  stopType?: 'stop_loss' | 'stop_limit';
}

// GET /api/institutional/orders/[id] - Get specific order details
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireApiKeyAuth(request);

    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 200, 60000);
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
      include: {
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
            id: true,
            amount: true,
            price: true,
            executedAt: true,
          },
          orderBy: {
            executedAt: 'desc',
          },
        },
        batch: {
          select: {
            id: true,
            status: true,
            idempotencyKey: true,
          },
        },
        _count: {
          select: {
            executions: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Calculate execution summary
    const executions = order.executions;
    const totalExecuted = executions.reduce((sum, exec) => sum + exec.amount, 0);
    const avgExecutionPrice = executions.length > 0
      ? executions.reduce((sum, exec) => sum + (exec.amount * exec.price), 0) / totalExecuted
      : 0;

    return NextResponse.json({
      order: {
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
        batchInfo: order.batch,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Execution summary
        executionCount: order._count.executions,
        totalExecuted,
        avgExecutionPrice,
        remainingAmount: order.amount - order.amountFilled,
        lastExecution: executions[0]?.executedAt || null,
        executions: executions.slice(0, 10), // Last 10 executions
      },
    });

  } catch (error) {
    console.error('Error fetching order:', error);

    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json({
      error: 'Failed to fetch order',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PUT /api/institutional/orders/[id] - Modify order (limited support)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireApiKeyAuth(request);

    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 50, 60000);
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    const body: ModifyOrderRequest = await request.json();

    // Get current order
    const currentOrder = await prisma.order.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
    });

    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Only allow modification of open orders
    if (currentOrder.status !== 'open') {
      return NextResponse.json({
        error: 'Can only modify open orders'
      }, { status: 400 });
    }

    // For now, only allow price modifications for limit orders
    // Advanced order modifications would require more complex logic
    if (currentOrder.orderType !== 'limit') {
      return NextResponse.json({
        error: 'Order modification not supported for this order type'
      }, { status: 400 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.price !== undefined) {
      if (body.price <= 0 || body.price >= 1) {
        return NextResponse.json({
          error: 'Price must be between 0 and 1'
        }, { status: 400 });
      }
      updateData.price = body.price;
    }

    // Note: Amount modification not supported as it would affect existing fills
    // Advanced order fields modification not implemented yet

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        event: {
          select: { title: true },
        },
        outcome: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: updatedOrder.id,
        price: updatedOrder.price,
        updatedAt: updatedOrder.updatedAt,
      },
    });

  } catch (error) {
    console.error('Error modifying order:', error);

    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json({
      error: 'Failed to modify order',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE /api/institutional/orders/[id] - Cancel order
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireApiKeyAuth(request);

    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 50, 60000);
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    // Get current order
    const currentOrder = await prisma.order.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
    });

    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Only allow cancellation of open orders
    if (currentOrder.status !== 'open') {
      return NextResponse.json({
        error: 'Can only cancel open orders'
      }, { status: 400 });
    }

    // Update order status to cancelled
    const cancelledOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
      include: {
        event: {
          select: { title: true },
        },
        outcome: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: cancelledOrder.id,
        status: cancelledOrder.status,
        updatedAt: cancelledOrder.updatedAt,
      },
    });

  } catch (error) {
    console.error('Error cancelling order:', error);

    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json({
      error: 'Failed to cancel order',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}