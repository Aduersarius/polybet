import { prisma } from '@/lib/prisma';
import { polymarketTrading } from '@/lib/polymarket-trading';

type HedgeUserOrderInput = {
  orderId: string;
  eventId: string;
  option: 'YES' | 'NO';
  amount: number;
  price: number;
  userId: string;
  polymarketOutcomeId?: string;
};

export async function hedgeUserOrder(input: HedgeUserOrderInput) {
  const { orderId, eventId, option, amount, price, polymarketOutcomeId } = input;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { polymarketId: true, source: true },
  });

  if (!event || event.source !== 'POLYMARKET' || !event.polymarketId) {
    return;
  }

  const mapping = await prisma.polymarketMarketMapping.findUnique({
    where: { internalEventId: eventId },
  });

  const outcome = polymarketOutcomeId
    ? await prisma.outcome.findFirst({ where: { polymarketOutcomeId } })
    : await prisma.outcome.findFirst({
        where: {
          eventId,
          name: { equals: option, mode: 'insensitive' },
        },
      });

  const polyOutcomeId =
    polymarketOutcomeId ||
    (outcome as any)?.polymarketOutcomeId ||
    (mapping?.outcomeMapping as any)?.outcomes?.find((o: any) => {
      return o?.name?.toLowerCase() === option.toLowerCase();
    })?.polymarketId;

  const polyMarketId = mapping?.polymarketId || event.polymarketId;
  const conditionId = mapping?.polymarketConditionId || polyMarketId;
  const tokenId = mapping?.polymarketTokenId || polyOutcomeId || polyMarketId;

  const polyOrder = await prisma.polyOrder.create({
    data: {
      userOrderId: orderId,
      eventId,
      outcomeId: outcome?.id || null,
      polymarketMarketId: polyMarketId,
      polymarketOutcomeId: polyOutcomeId || null,
      side: option === 'YES' ? 'buy' : 'sell',
      price,
      amount,
      status: 'pending',
    },
  });

  if (!polymarketTrading.isEnabled()) {
    console.warn('[Hedge] Trading disabled, marking PolyOrder failed', { orderId: polyOrder.id });
    await prisma.polyOrder.update({
      where: { id: polyOrder.id },
      data: { status: 'failed', error: 'Polymarket trading not enabled' },
    });
    return;
  }

  try {
    const placed = await polymarketTrading.placeOrder({
      marketId: polyMarketId,
      conditionId: conditionId || polyMarketId,
      tokenId: tokenId || polyMarketId,
      side: option === 'YES' ? 'BUY' : 'SELL',
      size: amount,
      price,
    });

    await prisma.polyOrder.update({
      where: { id: polyOrder.id },
      data: {
        status: 'placed',
        polymarketOrderId: placed.orderId,
        amountFilled: placed.filledSize || 0,
      },
    });

    console.log('[Hedge] Placed Polymarket order', {
      polyOrderId: polyOrder.id,
      polymarketOrderId: placed.orderId,
      marketId: polyMarketId,
      outcomeId: polyOutcomeId,
      side: option,
      size: amount,
      price,
    });

    await prisma.polyPosition.upsert({
      where: { eventId_outcomeId: { eventId, outcomeId: outcome?.id || null } },
      update: {
        hedgedExposure: { increment: placed.filledSize || amount },
        netExposure: { increment: option === 'YES' ? amount : -amount },
        polymarketOutcomeId: polyOutcomeId || null,
        polymarketMarketId: polyMarketId,
        lastHedgeAt: new Date(),
      },
      create: {
        eventId,
        outcomeId: outcome?.id || null,
        polymarketMarketId: polyMarketId,
        polymarketOutcomeId: polyOutcomeId || null,
        hedgedExposure: placed.filledSize || amount,
        netExposure: option === 'YES' ? amount : -amount,
        lastHedgeAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[Hedge] Failed to place Polymarket order', {
      polyOrderId: polyOrder.id,
      marketId: polyMarketId,
      outcomeId: polyOutcomeId,
      side: option,
      price,
      error,
    });
    await prisma.polyOrder.update({
      where: { id: polyOrder.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400),
      },
    });
    throw error;
  }
}

