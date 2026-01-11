/**
 * B-Book AMM Module
 * 
 * Internal AMM trading using LMSR (Logarithmic Market Scoring Rule).
 * Currently DISABLED - all trades go to Polymarket.
 * 
 * This module is preserved for future use when internal liquidity is needed.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
    calculateLMSROdds,
    calculateTokensForCost,
    calculateMultipleTokensForCost,
    calculateMultipleLMSRProbabilities,
} from './amm';

// Feature flag - enable when ready for internal market making
const BBOOK_ENABLED = false;

export interface BBookTradeResult {
    success: boolean;
    orderId?: string;
    fillPrice: number;
    fillSize: number;
    newProbability?: number;
    error?: string;
}

interface TradeContext {
    userId: string;
    eventId: string;
    side: 'buy' | 'sell';
    option: string;
    amount: number;
    eventType: 'BINARY' | 'MULTIPLE';
}

/**
 * Execute a trade using internal AMM liquidity.
 * Currently disabled - throws error if called.
 */
export async function executeBBookTrade(ctx: TradeContext): Promise<BBookTradeResult> {
    if (!BBOOK_ENABLED) {
        return {
            success: false,
            error: 'B-Book trading is disabled. Enable BBOOK_ENABLED flag when ready.',
            fillPrice: 0,
            fillSize: 0,
        };
    }

    // This logic is preserved from the original hybrid-trading.ts
    // for when internal AMM is re-enabled

    try {
        const event = await prisma.event.findUnique({
            where: { id: ctx.eventId },
            include: { outcomes: true }
        });

        if (!event) {
            return { success: false, error: 'Event not found', fillPrice: 0, fillSize: 0 };
        }

        if (ctx.eventType === 'BINARY') {
            return await executeBinaryTrade(ctx, event);
        } else {
            return await executeMultipleTrade(ctx, event);
        }

    } catch (error: any) {
        console.error('[BBookAMM] Trade failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            fillPrice: 0,
            fillSize: 0,
        };
    }
}

// ============================================================================
// Binary Event Trading (YES/NO)
// ============================================================================

async function executeBinaryTrade(ctx: TradeContext, event: any): Promise<BBookTradeResult> {
    const b = event.liquidityParameter || 20000;
    const qYes = Number(event.qYes) || 0;
    const qNo = Number(event.qNo) || 0;

    // Calculate current odds
    const odds = calculateLMSROdds(qYes, qNo, b);
    const currentPrice = ctx.option === 'YES' ? odds.yesPrice : odds.noPrice;

    // Calculate shares for cost
    const shares = calculateTokensForCost(
        qYes,
        qNo,
        ctx.amount,
        ctx.option as 'YES' | 'NO',
        b
    );

    if (shares <= 0) {
        return { success: false, error: 'Invalid trade calculation', fillPrice: 0, fillSize: 0 };
    }

    // Execute trade in transaction
    const result = await prisma.$transaction(async (tx: any) => {
        const tokenSymbol = `${ctx.option}_${ctx.eventId}`;

        // Update user balances
        if (ctx.side === 'buy') {
            await updateBalance(tx, ctx.userId, 'TUSD', null, -ctx.amount);
            await updateBalance(tx, ctx.userId, tokenSymbol, ctx.eventId, shares);
        } else {
            await updateBalance(tx, ctx.userId, tokenSymbol, ctx.eventId, -shares);
            await updateBalance(tx, ctx.userId, 'TUSD', null, ctx.amount);
        }

        // Update event liquidity
        const qYesDelta = ctx.option === 'YES' ? shares : 0;
        const qNoDelta = ctx.option === 'NO' ? shares : 0;

        await tx.event.update({
            where: { id: ctx.eventId },
            data: {
                qYes: { increment: ctx.side === 'buy' ? qYesDelta : -qYesDelta },
                qNo: { increment: ctx.side === 'buy' ? qNoDelta : -qNoDelta },
            }
        });

        // Create order record
        const order = await tx.order.create({
            data: {
                userId: ctx.userId,
                eventId: ctx.eventId,
                orderType: 'MARKET',
                side: ctx.side.toUpperCase() as 'BUY' | 'SELL',
                price: currentPrice,
                amount: shares,
                amountFilled: shares,
                status: 'filled',
            }
        });

        // Create market activity
        await tx.marketActivity.create({
            data: {
                userId: ctx.userId,
                eventId: ctx.eventId,
                type: 'TRADE',
                option: ctx.option,
                amount: ctx.amount, // USD Value
                price: currentPrice,
                side: ctx.side.toUpperCase(),
                isAmmInteraction: true,
                orderId: order.id
            }
        });

        return { orderId: order.id, fillPrice: currentPrice, fillSize: shares };
    });

    // Calculate new probability
    const newQYes = qYes + (ctx.option === 'YES' && ctx.side === 'buy' ? shares : 0);
    const newQNo = qNo + (ctx.option === 'NO' && ctx.side === 'buy' ? shares : 0);
    const newOdds = calculateLMSROdds(newQYes, newQNo, b);

    return {
        success: true,
        orderId: result.orderId,
        fillPrice: result.fillPrice,
        fillSize: result.fillSize,
        newProbability: ctx.option === 'YES' ? newOdds.yesPrice : newOdds.noPrice,
    };
}

// ============================================================================
// Multiple Outcome Trading
// ============================================================================

async function executeMultipleTrade(ctx: TradeContext, event: any): Promise<BBookTradeResult> {
    const b = event.liquidityParameter || 20000;

    // Build liquidity map from outcomes
    const liquidityMap = new Map<string, number>();
    for (const outcome of event.outcomes) {
        liquidityMap.set(outcome.id, Number(outcome.liquidity) || 0);
    }

    // Calculate probabilities
    const probabilities = calculateMultipleLMSRProbabilities(liquidityMap, b);
    const currentPrice = probabilities.get(ctx.option) || 0;

    if (currentPrice <= 0) {
        return { success: false, error: 'Invalid outcome probability', fillPrice: 0, fillSize: 0 };
    }

    // Calculate shares
    const shares = calculateMultipleTokensForCost(liquidityMap, ctx.amount, ctx.option, b);

    if (shares <= 0) {
        return { success: false, error: 'Invalid trade calculation', fillPrice: 0, fillSize: 0 };
    }

    // Execute in transaction
    const result = await prisma.$transaction(async (tx: any) => {
        // Update user balances
        if (ctx.side === 'buy') {
            await updateBalance(tx, ctx.userId, 'TUSD', null, -ctx.amount);
            await updateBalance(tx, ctx.userId, ctx.option, ctx.eventId, shares);
        } else {
            await updateBalance(tx, ctx.userId, ctx.option, ctx.eventId, -shares);
            await updateBalance(tx, ctx.userId, 'TUSD', null, ctx.amount);
        }

        // Update outcome liquidity
        await tx.outcome.update({
            where: { id: ctx.option },
            data: {
                liquidity: { increment: ctx.side === 'buy' ? shares : -shares }
            }
        });

        // Create order
        const order = await tx.order.create({
            data: {
                userId: ctx.userId,
                eventId: ctx.eventId,
                outcomeId: ctx.option,
                type: 'MARKET',
                side: ctx.side.toUpperCase() as 'BUY' | 'SELL',
                price: currentPrice,
                size: shares,
                status: 'FILLED',
                filledSize: shares,
                filledAt: new Date(),
            }
        });

        // Create activity
        await tx.marketActivity.create({
            data: {
                userId: ctx.userId,
                eventId: ctx.eventId,
                outcomeId: ctx.option,
                type: 'TRADE',
                option: ctx.option,
                amount: ctx.amount,
                shares: shares,
                price: currentPrice,
                side: ctx.side.toUpperCase(),
            }
        });

        return { orderId: order.id, fillPrice: currentPrice, fillSize: shares };
    });

    return {
        success: true,
        orderId: result.orderId,
        fillPrice: result.fillPrice,
        fillSize: result.fillSize,
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function updateBalance(
    tx: any,
    userId: string,
    tokenSymbol: string,
    eventId: string | null,
    amountDelta: number
): Promise<void> {
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

/**
 * Check if B-Book is enabled
 */
export function isBBookEnabled(): boolean {
    return BBOOK_ENABLED;
}
