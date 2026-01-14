
import { prisma } from '@/lib/prisma';
import { MarketContext } from './resolver';
import { ExecutionResult } from './executor';

export interface AccountingContext {
    userId: string;
    eventId: string;
    option: string;
    side: 'buy' | 'sell';
    amountInUsd: number;
}

/**
 * Persists all trade data to the database in a single transaction
 */
export async function persistTradePipeline(
    ctx: AccountingContext,
    market: MarketContext,
    execution: ExecutionResult
) {
    return await prisma.$transaction(async (tx: any) => {
        // 1. Create the internal Order record
        const order = await tx.order.create({
            data: {
                userId: ctx.userId,
                eventId: ctx.eventId,
                orderType: 'MARKET',
                side: ctx.side.toUpperCase() as 'BUY' | 'SELL',
                price: execution.fillPrice,
                amount: execution.fillSize,
                amountFilled: execution.fillSize,
                status: 'filled',
            }
        });

        // 2. Create Market Activity
        await tx.marketActivity.create({
            data: {
                userId: ctx.userId,
                eventId: ctx.eventId,
                type: 'TRADE',
                option: ctx.option,
                amount: ctx.amountInUsd,
                price: execution.fillPrice,
                side: ctx.side.toUpperCase(),
                isAmmInteraction: false,
                orderId: order.id
            }
        });

        // 3. Create Hedge Position record
        await tx.hedgePosition.create({
            data: {
                userOrderId: order.id,
                polymarketOrderId: execution.orderId,
                polymarketMarketId: market.polymarketId,
                side: ctx.side.toUpperCase() as 'BUY' | 'SELL',
                amount: execution.fillSize,
                userPrice: execution.fillPrice,
                hedgePrice: execution.fillPrice,
                spreadCaptured: 0,
                polymarketFees: execution.fees,
                status: 'hedged',
            }
        });

        // 4. Update User Balances
        const tokenSymbol = ctx.side === 'buy' ? 'TUSD' : `${ctx.option}_${ctx.eventId}`;
        const amountDelta = ctx.side === 'buy' ? -ctx.amountInUsd : -execution.fillSize;

        await updateBalance(tx, ctx.userId, tokenSymbol, ctx.side === 'buy' ? null : ctx.eventId, amountDelta);

        // If it's a BUY, they get shares. If it's a SELL, they get TUSD (Simplified for now - settlement handles winnings)
        if (ctx.side === 'buy') {
            const shareSymbol = `${ctx.option}_${ctx.eventId}`;
            await updateBalance(tx, ctx.userId, shareSymbol, ctx.eventId, execution.fillSize);
        } else {
            await updateBalance(tx, ctx.userId, 'TUSD', null, execution.fillSize * execution.fillPrice);
        }

        return { orderId: order.id };
    });
}

/**
 * Atomic balance update (Upsert)
 */
async function updateBalance(
    tx: any,
    userId: string,
    tokenSymbol: string,
    eventId: string | null,
    amountDelta: number
) {
    const existing = await tx.balance.findFirst({
        where: { userId, tokenSymbol, eventId, outcomeId: null },
        select: { id: true }
    });

    if (existing) {
        await tx.balance.update({
            where: { id: existing.id },
            data: { amount: { increment: amountDelta } }
        });
    } else {
        await tx.balance.create({
            data: { userId, tokenSymbol, eventId, outcomeId: null, amount: amountDelta }
        });
    }
}
