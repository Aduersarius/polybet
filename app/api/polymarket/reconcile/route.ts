import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  try {
    const { prisma } = await import('@/lib/prisma');
    const { polymarketTrading } = await import('@/lib/polymarket-trading');

    const openOrders = await prisma.polyOrder.findMany({
      where: { status: { in: ['pending', 'placed', 'partial'] }, polymarketOrderId: { not: null } },
      take: 50,
    });

    if (!polymarketTrading.isEnabled()) {
      return NextResponse.json(
        {
          error: 'Polymarket trading not enabled',
          openOrders: openOrders.length,
        },
        { status: 503 }
      );
    }

    let updated = 0;

    for (const order of openOrders) {
      if (!order.polymarketOrderId) continue;
      const status = await polymarketTrading.getOrderStatus(order.polymarketOrderId);
      if (!status) continue;

      const isFilled = status.remainingSize <= 0 || status.status?.toLowerCase() === 'matched';
      const nextStatus = isFilled ? 'filled' : 'partial';

      await prisma.polyOrder.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          amountFilled: status.filledSize || order.amountFilled,
          updatedAt: new Date(),
        },
      });

      await prisma.polyPosition.upsert({
        where: { eventId_outcomeId: { eventId: order.eventId, outcomeId: order.outcomeId || null } },
        update: {
          hedgedExposure: { increment: status.filledSize || 0 },
          lastHedgeAt: new Date(),
        },
        create: {
          eventId: order.eventId,
          outcomeId: order.outcomeId || null,
          polymarketMarketId: order.polymarketMarketId,
          polymarketOutcomeId: order.polymarketOutcomeId,
          hedgedExposure: status.filledSize || 0,
          netExposure: status.filledSize || 0,
          lastHedgeAt: new Date(),
        },
      });

      updated++;
    }

    // Close expired Polymarket events as a lightweight settlement placeholder
    const now = new Date();
    const closedEvents = await prisma.event.updateMany({
      where: {
        source: 'POLYMARKET',
        status: 'ACTIVE',
        resolutionDate: { lt: now },
      },
      data: {
        status: 'CLOSED',
        resolvedAt: now,
        resolutionSource: 'POLYMARKET',
      },
    });

    return NextResponse.json({
      openOrders: openOrders.length,
      updated,
      closedEvents: closedEvents.count,
      elapsedMs: Date.now() - start,
    });
  } catch (error) {
    console.error('[Polymarket Reconcile] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

