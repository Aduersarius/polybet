export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiKeyAuth, checkInstitutionalRateLimit, checkVolumeLimit, hasPermission } from '@/lib/api-auth';
import { placeHybridOrder } from '@/lib/hybrid-trading';
import { redis } from '@/lib/redis';

interface BulkOrderRequest {
  idempotencyKey: string;
  orders: Array<{
    eventId: string;
    side: 'buy' | 'sell';
    option?: 'YES' | 'NO'; // For binary events
    outcomeId?: string; // For multiple events
    amount: number;
    price?: number; // Required for limit orders
    orderType?: 'market' | 'limit' | 'iceberg' | 'twap' | 'stop';
    // Advanced order parameters
    visibleAmount?: number; // For iceberg
    timeWindow?: number; // For TWAP (minutes)
    totalDuration?: number; // For TWAP (minutes)
    stopPrice?: number; // For stop orders
    stopType?: 'stop_loss' | 'stop_limit'; // For stop orders
  }>;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate API key
    const auth = await requireApiKeyAuth(request);

    // Require trade/write capability
    const canTrade = hasPermission(auth, 'trade') || hasPermission(auth, 'write');
    if (!canTrade) {
      return NextResponse.json({ error: 'Insufficient permissions. Trade access required.' }, { status: 403 });
    }

    // Check rate limit
    if (redis) {
      const withinLimit = await checkInstitutionalRateLimit(auth.accountId, redis, 50, 60000); // 50 requests per minute
      if (!withinLimit) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    const body: BulkOrderRequest = await request.json();
    const { idempotencyKey, orders } = body;

    // Validate request
    if (!idempotencyKey || !orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({
        error: 'Missing required fields: idempotencyKey and orders array'
      }, { status: 400 });
    }

    if (orders.length > 100) {
      return NextResponse.json({
        error: 'Maximum 100 orders per bulk request'
      }, { status: 400 });
    }

    // Check idempotency - prevent duplicate bulk operations
    const existingBatch = await prisma.batchOrder.findUnique({
      where: { idempotencyKey },
    });

    if (existingBatch) {
      // Return existing batch result
      const batchOrders = await prisma.order.findMany({
        where: { batchId: existingBatch.id },
        select: {
          id: true,
          status: true,
          amount: true,
          amountFilled: true,
          orderType: true,
        },
      });

      return NextResponse.json({
        batchId: existingBatch.id,
        status: existingBatch.status,
        totalOrders: existingBatch.totalOrders,
        successfulOrders: existingBatch.successfulOrders,
        failedOrders: existingBatch.failedOrders,
        orders: batchOrders,
        message: 'Batch already processed',
      });
    }

    // Create batch record
    const batch = await prisma.batchOrder.create({
      data: {
        userId: auth.userId,
        idempotencyKey,
        totalOrders: orders.length,
        status: 'processing',
      },
    });

    const results = [];
    let successfulOrders = 0;
    let failedOrders = 0;

    // Process each order
    for (const [index, orderData] of orders.entries()) {
      try {
        const {
          eventId,
          side,
          option,
          outcomeId,
          amount,
          price,
          orderType = 'limit',
          visibleAmount,
          timeWindow,
          totalDuration,
          stopPrice,
          stopType,
        } = orderData;

        // Basic validation
        const targetOption = option || outcomeId;
        if (!eventId || !side || !targetOption || !amount) {
          throw new Error('Missing required order fields');
        }

        if (!['buy', 'sell'].includes(side)) {
          throw new Error('Side must be "buy" or "sell"');
        }

        if (amount <= 0) {
          throw new Error('Amount must be greater than 0');
        }

        // Check volume limits
        await checkVolumeLimit(auth, amount);

        // Validate advanced order types
        if (orderType === 'iceberg' && (!visibleAmount || visibleAmount >= amount)) {
          throw new Error('Iceberg orders require visibleAmount < total amount');
        }

        if (orderType === 'twap' && (!timeWindow || !totalDuration)) {
          throw new Error('TWAP orders require timeWindow and totalDuration');
        }

        if (orderType === 'stop' && (!stopPrice || !stopType)) {
          throw new Error('Stop orders require stopPrice and stopType');
        }

        if (orderType === 'limit' && !price) {
          throw new Error('Limit orders require price');
        }

        // For now, only support market and limit orders in the execution engine
        // Advanced orders would need additional processing logic
        if (!['market', 'limit'].includes(orderType)) {
          throw new Error(`Order type ${orderType} not yet supported`);
        }

        // Execute the order
        const result = await placeHybridOrder(
          auth.userId,
          eventId,
          side as 'buy' | 'sell',
          targetOption,
          amount,
          orderType === 'limit' ? price : undefined
        );

        if (!result.success) {
          throw new Error(result.error || 'Order execution failed');
        }

        // Find the created order (either limit order or the placeholder from market execution)
        let orderId: string;
        if (orderType === 'limit') {
          // For limit orders, find the order we just created
          const createdOrder = await prisma.order.findFirst({
            where: {
              userId: auth.userId,
              eventId,
              side,
              amount,
              status: 'open',
              createdAt: {
                gte: new Date(Date.now() - 5000),
              },
            },
          });
          if (!createdOrder) {
            throw new Error('Failed to find created limit order');
          }
          orderId = createdOrder.id;
        } else {
          // For market orders, use the orderId from result (which is the market activity ID)
          orderId = result.orderId!;
        }

        // Update the order with batch ID and advanced fields
        await prisma.order.update({
          where: { id: orderId },
          data: {
            batchId: batch.id,
            orderType,
            visibleAmount: orderType === 'iceberg' ? visibleAmount : undefined,
            totalAmount: orderType === 'iceberg' ? amount : undefined,
            timeWindow: orderType === 'twap' ? timeWindow : undefined,
            totalDuration: orderType === 'twap' ? totalDuration : undefined,
            stopPrice: orderType === 'stop' ? stopPrice : undefined,
            stopType: orderType === 'stop' ? stopType : undefined,
            // For market orders, mark as filled
            ...(orderType === 'market' && {
              amountFilled: result.totalFilled,
              status: 'filled',
            }),
          },
        });

        // For market orders, create OrderExecution record
        if (orderType === 'market' && result.totalFilled > 0) {
          await prisma.orderExecution.create({
            data: {
              orderId,
              amount: result.totalFilled,
              price: result.averagePrice,
            },
          });
        }

        results.push({
          index,
          success: true,
          orderId: result.orderId,
          totalFilled: result.totalFilled,
          averagePrice: result.averagePrice,
        });

        successfulOrders++;

        // Update daily volume
        await prisma.institutionalAccount.update({
          where: { id: auth.institutionalAccount.id },
          data: {
            dailyVolume: {
              increment: result.totalFilled,
            },
            dailyVolumeDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
          },
        });

      } catch (error) {
        console.error(`Order ${index} failed:`, error);
        results.push({
          index,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failedOrders++;
      }
    }

    // Update batch status
    const finalStatus = failedOrders === 0 ? 'completed' : failedOrders === orders.length ? 'failed' : 'completed';
    await prisma.batchOrder.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        successfulOrders,
        failedOrders,
      },
    });

    const totalTime = Date.now() - startTime;
    console.log(`✅ Bulk order batch ${batch.id} completed in ${totalTime}ms: ${successfulOrders}/${orders.length} successful`);

    return NextResponse.json({
      batchId: batch.id,
      status: finalStatus,
      totalOrders: orders.length,
      successfulOrders,
      failedOrders,
      results,
      processingTimeMs: totalTime,
    });

  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`❌ Bulk order failed after ${errorTime}ms:`, error);

    if (error instanceof Response) {
      return error; // Already formatted error response
    }

    return NextResponse.json({
      error: 'Bulk order processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}