/**
 * Polymarket Hedging Module (A-Book)
 * 
 * Single module for executing trades on Polymarket-sourced events.
 * This is the primary execution path (100% of trades currently).
 * 
 * KISS: All Polymarket trading logic in one place.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { polymarketTrading, estimatePolymarketFees } from './polymarket-trading';
import { polymarketCircuit, CircuitOpenError } from './circuit-breaker';
import { RiskManager } from './risk-manager';

// Constants
const PLATFORM_FEE = 0.02; // 2% commission on winnings
const MAX_RETRIES = 3;
const HEDGE_TIMEOUT_MS = 10000;

export interface PolymarketTradeResult {
    success: boolean;
    orderId?: string;
    hedgePositionId?: string;
    fillPrice: number;
    fillSize: number;
    fees: number;
    spreadCaptured?: number;
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
 * Execute a trade on a Polymarket-sourced event.
 * Handles: quote calculation, hedge execution, balance updates, order recording.
 */
export async function executePolymarketTrade(ctx: TradeContext): Promise<PolymarketTradeResult> {
    const startTime = Date.now();
    console.log(`[PolymarketHedging] Starting trade: ${ctx.side} ${ctx.amount} USD on ${ctx.eventId}:${ctx.option}`);

    try {
        // 1. Get Polymarket mapping
        const mapping = await prisma.polymarketMarketMapping.findUnique({
            where: { internalEventId: ctx.eventId }
        });

        if (!mapping) {
            return { success: false, error: 'No Polymarket mapping found', fillPrice: 0, fillSize: 0, fees: 0 };
        }

        // 2. Resolve token ID based on option
        const tokenId = resolveTokenId(mapping, ctx.option);
        if (!tokenId) {
            return { success: false, error: 'Could not resolve Polymarket token ID', fillPrice: 0, fillSize: 0, fees: 0 };
        }

        // 3. Get Polymarket price and calculate shares
        let polymarketPrice = getPolymarketPrice(mapping, ctx.option);

        try {
            // Fetch live orderbook to ensure accurate pricing (avoid min size errors)
            const orderBook = await polymarketTrading.getOrderbook(tokenId);

            if (ctx.side === 'buy') {
                // For BUY, we look at ASKS (lowest price is best)
                // CLOB API might return them descending, so we MUST sort ASCENDING
                const asks = orderBook.asks.sort((a: any, b: any) => a.price - b.price);
                if (asks.length > 0) {
                    polymarketPrice = asks[0].price;
                    console.log(`[PolymarketHedging] Fetched live price (Best Ask): ${polymarketPrice}`);
                }
            } else {
                // For SELL, we look at BIDS (highest price is best)
                // We MUST sort DESCENDING
                const bids = orderBook.bids.sort((a: any, b: any) => b.price - a.price);
                if (bids.length > 0) {
                    polymarketPrice = bids[0].price;
                    console.log(`[PolymarketHedging] Fetched live price (Best Bid): ${polymarketPrice}`);
                }
            }
        } catch (err) {
            console.warn(`[PolymarketHedging] Failed to fetch live price, using cached:`, err);
        }

        if (!polymarketPrice || polymarketPrice <= 0 || polymarketPrice >= 1) {
            // Fallback or error
            if (polymarketPrice <= 0) polymarketPrice = 0.5;
        }

        const shares = ctx.amount / polymarketPrice;
        console.log(`[PolymarketHedging] Price: ${polymarketPrice}, Shares: ${shares.toFixed(4)}`);

        // 4. Risk check
        const currentProb = polymarketPrice;
        const predictedProb = currentProb; // For market orders, price stays same
        const riskCheck = await RiskManager.validateTrade(
            ctx.userId,
            ctx.eventId,
            ctx.amount,
            ctx.side,
            ctx.option,
            currentProb,
            predictedProb
        );

        if (!riskCheck.allowed) {
            return { success: false, error: riskCheck.reason, fillPrice: 0, fillSize: 0, fees: 0 };
        }

        // 5. Check user balance
        await ensureSufficientBalance(ctx.userId, ctx.side, ctx.amount, ctx.eventId, ctx.option);

        // 6. Execute on Polymarket (if order is large enough)
        let hedgeResult: { orderId?: string; fillPrice: number; fillSize: number; fees: number } | null = null;
        const orderValue = shares * polymarketPrice;

        if (orderValue >= 1.1) { // Minimum $1 for Polymarket, but use $1.1 to account for rounding
            hedgeResult = await executeOnPolymarket(mapping, tokenId, ctx.side, shares, polymarketPrice);
            if (!hedgeResult) {
                return { success: false, error: 'Failed to execute on Polymarket', fillPrice: 0, fillSize: 0, fees: 0 };
            }
        } else {
            console.log(`[PolymarketHedging] Order too small ($${orderValue.toFixed(4)}), skipping Polymarket execution`);
            hedgeResult = { fillPrice: polymarketPrice, fillSize: shares, fees: 0 };
        }

        // 7. Record order and update balances in transaction
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

            // Create order record
            const order = await tx.order.create({
                data: {
                    userId: ctx.userId,
                    eventId: ctx.eventId,
                    outcomeId: null,
                    orderType: 'MARKET',
                    side: ctx.side.toUpperCase() as 'BUY' | 'SELL',
                    price: hedgeResult!.fillPrice,
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
                    price: hedgeResult!.fillPrice,
                    side: ctx.side.toUpperCase(),
                    isAmmInteraction: false,
                    orderId: order.id
                }
            });

            // Create hedge position record (if we hedged on Polymarket)
            let hedgePositionId: string | undefined;
            if (hedgeResult!.orderId) {
                const hedgePosition = await tx.hedgePosition.create({
                    data: {
                        userOrderId: order.id,
                        polymarketOrderId: hedgeResult!.orderId,
                        polymarketMarketId: mapping.polymarketId,
                        side: ctx.side.toUpperCase() as 'BUY' | 'SELL',
                        amount: shares,
                        userPrice: hedgeResult!.fillPrice,
                        hedgePrice: hedgeResult!.fillPrice,
                        spreadCaptured: 0,
                        polymarketFees: hedgeResult!.fees,
                        gasCost: 0,
                        status: 'hedged',
                    }
                });
                hedgePositionId = hedgePosition.id;
            }

            return { orderId: order.id, hedgePositionId };
        });

        const duration = Date.now() - startTime;
        console.log(`[PolymarketHedging] Trade completed in ${duration}ms`);

        return {
            success: true,
            orderId: result.orderId,
            hedgePositionId: result.hedgePositionId,
            fillPrice: hedgeResult.fillPrice,
            fillSize: hedgeResult.fillSize,
            fees: hedgeResult.fees,
        };

    } catch (error: any) {
        console.error('[PolymarketHedging] Trade failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            fillPrice: 0,
            fillSize: 0,
            fees: 0,
        };
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve the Polymarket token ID based on option (YES/NO or outcomeId)
 */
function resolveTokenId(mapping: any, option: string): string | null {
    if (option === 'YES') {
        return mapping.yesTokenId || mapping.polymarketTokenId;
    } else if (option === 'NO') {
        return mapping.noTokenId;
    }
    // For multiple choice, option might be an outcome name or ID
    // We should ideally look into outcomeMapping, but for now fallback
    return mapping.polymarketTokenId;
}

/**
 * Get current Polymarket price from cached mapping data
 */
function getPolymarketPrice(mapping: any, option: string): number {
    if (option === 'YES') {
        return mapping.lastYesPrice || mapping.lastPrice || 0.5;
    } else if (option === 'NO') {
        return mapping.lastNoPrice || (1 - (mapping.lastYesPrice || 0.5));
    }
    return mapping.lastPrice || 0.5;
}

/**
 * Execute order on Polymarket via circuit breaker
 */
async function executeOnPolymarket(
    mapping: any,
    tokenId: string,
    side: 'buy' | 'sell',
    size: number,
    price: number
): Promise<{ orderId: string; fillPrice: number; fillSize: number; fees: number } | null> {
    try {
        // Check circuit breaker
        const stats = polymarketCircuit.getStats();
        if (stats.state === 'OPEN') {
            console.error('[PolymarketHedging] Circuit breaker OPEN, cannot execute');
            return null;
        }

        // Execute with retry
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[PolymarketHedging] Polymarket order attempt ${attempt}/${MAX_RETRIES}`);

                const order = await polymarketCircuit.execute(() =>
                    polymarketTrading.placeMarketOrder(
                        mapping.polymarketId,
                        mapping.polymarketConditionId || '',
                        tokenId,
                        side === 'buy' ? 'BUY' : 'SELL',
                        size
                    )
                );

                const fees = estimatePolymarketFees(size, price);

                return {
                    orderId: order.orderId,
                    fillPrice: order.price || price,
                    fillSize: order.filledSize || size,
                    fees,
                };

            } catch (error: any) {
                console.error(`[PolymarketHedging] Attempt ${attempt} failed:`, error.message);

                // Check for permanent errors
                const msg = error.message?.toLowerCase() || '';
                if (msg.includes('insufficient') || msg.includes('unauthorized') || msg.includes('invalid')) {
                    break; // Don't retry permanent errors
                }

                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * attempt)); // Backoff
                }
            }
        }

        return null;

    } catch (error) {
        console.error('[PolymarketHedging] executeOnPolymarket error:', error);
        return null;
    }
}

/**
 * Check user has sufficient balance
 */
async function ensureSufficientBalance(
    userId: string,
    side: 'buy' | 'sell',
    amount: number,
    eventId: string,
    option: string
): Promise<void> {
    if (side === 'buy') {
        // Check TUSD balance
        const balance = await prisma.balance.findFirst({
            where: { userId, tokenSymbol: 'TUSD', eventId: null, outcomeId: null },
            select: { amount: true }
        });

        const available = balance?.amount ? Number(balance.amount) : 0;
        if (available < amount) {
            throw new Error(`Insufficient balance: need $${amount.toFixed(2)}, have $${available.toFixed(2)}`);
        }
    } else {
        // Check shares balance
        const tokenSymbol = `${option}_${eventId}`;
        const balance = await prisma.balance.findFirst({
            where: { userId, tokenSymbol, eventId, outcomeId: null },
            select: { amount: true }
        });

        const available = balance?.amount ? Number(balance.amount) : 0;
        if (available < amount) {
            throw new Error(`Insufficient shares: need ${amount.toFixed(4)}, have ${available.toFixed(4)}`);
        }
    }
}

/**
 * Update user balance (atomic upsert-like operation)
 */
async function updateBalance(
    tx: any,
    userId: string,
    tokenSymbol: string,
    eventId: string | null,
    amountDelta: number
): Promise<void> {
    const existing = await tx.balance.findFirst({
        where: { userId, tokenSymbol, eventId, outcomeId: null },
        select: { id: true, amount: true }
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

// ============================================================================
// Settlement (for event resolution)
// ============================================================================

/**
 * Settle all hedge positions for a resolved event
 */
export async function settleEventHedges(
    eventId: string,
    winningOutcome: string
): Promise<{ settled: number; totalPnl: number }> {
    const positions = await prisma.hedgePosition.findMany({
        where: {
            userOrder: { eventId },
            status: 'hedged'
        },
        include: { userOrder: true }
    });

    let settled = 0;
    let totalPnl = 0;

    for (const position of positions) {
        const result = await settleHedgePosition(position.id, winningOutcome);
        if (result.settled) {
            settled++;
            totalPnl += result.pnl;
        }
    }

    return { settled, totalPnl };
}

/**
 * Settle a single hedge position
 */
export async function settleHedgePosition(
    hedgePositionId: string,
    winningOutcome: string
): Promise<{ settled: boolean; pnl: number; error?: string }> {
    const position = await prisma.hedgePosition.findUnique({
        where: { id: hedgePositionId },
        include: { userOrder: true }
    });

    if (!position) {
        return { settled: false, pnl: 0, error: 'Position not found' };
    }

    if (position.status === 'closed') {
        return { settled: true, pnl: Number(position.netProfit) || 0 };
    }

    // Calculate P/L
    const userOption = position.userOrder?.option || 'YES';
    const won = userOption === winningOutcome;
    const amount = Number(position.amount);
    const spreadCaptured = Number(position.spreadCaptured) || 0;
    const fees = Number(position.polymarketFees) + Number(position.gasCost);

    // For a hedged position, P/L = spread - fees (wins/losses cancel out)
    const pnl = spreadCaptured - fees;

    await prisma.hedgePosition.update({
        where: { id: hedgePositionId },
        data: {
            status: 'closed',
            netProfit: pnl,
            settlementPrice: won ? 1 : 0,
            closedAt: new Date(),
        }
    });

    return { settled: true, pnl };
}
