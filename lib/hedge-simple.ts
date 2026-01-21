/**
 * Simple KISS Hedging Module
 * 
 * Flow:
 * 1. Validate request
 * 2. Fetch live Polymarket price
 * 3. Calculate our offer price (PM + spread)
 * 4. Place hedge on Polymarket
 * 5. Execute user's trade
 * 6. Record everything
 * 
 * Zero unhedged risk - we only confirm user's bet AFTER we're hedged
 */

import { prisma } from './prisma';
import { polymarketTrading } from './polymarket-trading';
import { polymarketCircuit } from './circuit-breaker';
import { hedgeManager } from './hedge-manager';
import { HEDGE_CONFIG, validateOrderSize, calculateUserPrice, calculateProfit } from './hedge-config';

// ============================================================================
// Types
// ============================================================================

export interface HedgeRequest {
    userId: string;
    eventId: string;
    option: 'YES' | 'NO';
    amount: number; // USD amount user wants to bet
}

export interface HedgeResult {
    success: boolean;
    userOrderId?: string;
    userPrice?: number;
    userAmount?: number;
    polymarketPrice?: number;
    polymarketOrderId?: string;
    spread?: number;
    netProfit?: number;
    error?: string;
    errorCode?: 'VALIDATION' | 'MAPPING' | 'POLYMARKET' | 'DATABASE' | 'CIRCUIT_OPEN' | 'DISABLED';
}

interface PolymarketMapping {
    polymarketId: string;
    polymarketTokenId: string;
    polymarketConditionId: string | null;
    isActive: boolean;
    outcomeMapping: any;
}

// ============================================================================
// Core Function
// ============================================================================

/**
 * Execute hedge-first flow
 * 
 * This is the main entry point - replaces hedgeUserOrder() and hedgeManager.executeHedge()
 */
export async function hedgeAndExecute(
    request: HedgeRequest,
    options?: { skipUserTrade?: boolean }
): Promise<HedgeResult> {
    const startTime = Date.now();
    console.log('[HedgeSimple] Starting hedge-and-execute:', request);

    try {
        // STEP 0: Check Configuration (Dynamic)
        // This allows the "Disable Hedging" button in dashboard to work instantly
        const dbConfig = await hedgeManager.loadConfig();
        if (!dbConfig.enabled) {
            console.warn('[HedgeSimple] Hedging globally disabled via config');
            if (HEDGE_CONFIG.allowUnhedged) {
                return await executeUnhedgedTrade(request);
            }
            return {
                success: false,
                error: 'Trading temporarily disabled by admin',
                errorCode: 'DISABLED'
            };
        }

        // ========================================================================
        // STEP 1: Validate Request
        // ========================================================================
        const validation = await validateRequest(request);
        if (!validation.valid || !validation.mapping || !validation.tokenId) {
            return {
                success: false,
                error: validation.error || 'Validation failed',
                errorCode: 'VALIDATION',
            };
        }

        const { event, mapping, tokenId } = validation;

        // ========================================================================
        // STEP 2: Check Circuit Breaker
        // ========================================================================
        if (!polymarketCircuit.isAllowed()) {
            if (HEDGE_CONFIG.allowUnhedged) {
                console.warn('[HedgeSimple] Circuit open, allowing unhedged trade');
                return await executeUnhedgedTrade(request);
            } else {
                return {
                    success: false,
                    error: 'Polymarket unavailable, hedging disabled',
                    errorCode: 'CIRCUIT_OPEN',
                };
            }
        }

        // ========================================================================
        // STEP 3: Fetch Live Polymarket Price
        // ========================================================================
        const polymarketPrice = await fetchPolymarketPrice(tokenId, request.option);
        if (!polymarketPrice) {
            return {
                success: false,
                error: 'Failed to fetch Polymarket price',
                errorCode: 'POLYMARKET',
            };
        }

        console.log(`[HedgeSimple] Polymarket price for ${request.option}: $${polymarketPrice.toFixed(4)}`);

        // ========================================================================
        // STEP 4: Calculate User Price (PM + Spread)
        // ========================================================================
        const userPrice = calculateUserPrice(polymarketPrice, HEDGE_CONFIG.defaultSpread);

        // Check slippage protection
        const drift = Math.abs(userPrice - polymarketPrice) / polymarketPrice;
        if (drift > HEDGE_CONFIG.maxSlippage) {
            return {
                success: false,
                error: `Price moved too much (${(drift * 100).toFixed(1)}%), please retry`,
                errorCode: 'POLYMARKET',
            };
        }

        // Check profitability
        const economics = calculateProfit({
            amount: request.amount,
            polymarketPrice,
            userPrice,
        });

        if (economics.netProfit < HEDGE_CONFIG.minProfit) {
            return {
                success: false,
                error: `Order unprofitable: net profit $${economics.netProfit.toFixed(4)} < minimum $${HEDGE_CONFIG.minProfit}`,
                errorCode: 'VALIDATION',
            };
        }

        console.log(`[HedgeSimple] Economics: spread=$${economics.spread.toFixed(4)}, fees=$${economics.fees.toFixed(4)}, profit=$${economics.netProfit.toFixed(4)}`);

        // ========================================================================
        // STEP 5: Place Hedge on Polymarket (CRITICAL - Do this FIRST)
        // ========================================================================
        const hedgeResult = await placePolymarketHedge({
            marketId: mapping.polymarketId,
            conditionId: mapping.polymarketConditionId || mapping.polymarketId,
            tokenId,
            side: request.option === 'YES' ? 'BUY' : 'SELL',
            amount: request.amount,
            targetPrice: polymarketPrice,
        });

        if (!hedgeResult.success) {
            // Hedge failed - DO NOT execute user's trade
            polymarketCircuit.onFailure(); // Record failure for circuit breaker

            return {
                success: false,
                error: `Hedge failed: ${hedgeResult.error}`,
                errorCode: 'POLYMARKET',
            };
        }

        console.log(`[HedgeSimple] Hedge placed successfully: ${hedgeResult.orderId}`);
        polymarketCircuit.onSuccess(); // Record success

        // ========================================================================
        // STEP 6: Execute User's Trade (Now that we're hedged)
        // PHASE 1: Skip if AMM already created the order
        // ========================================================================
        let userTradeOrderId;

        if (!options?.skipUserTrade) {
            const userTrade = await executeUserTrade({
                userId: request.userId,
                eventId: request.eventId,
                option: request.option,
                amount: request.amount,
                price: userPrice,
            });

            if (!userTrade.success) {
                // User trade failed BUT we're hedged on Polymarket
                // Log critical error - manual intervention may be needed
                console.error('[HedgeSimple] CRITICAL: User trade failed but hedge succeeded!', {
                    polymarketOrderId: hedgeResult.orderId,
                    error: userTrade.error,
                });

                // ATTEMPT ROLLBACK: Close the Polymarket position immediately
                console.log('[HedgeSimple] Initiating emergency rollback of hedge...');

                try {
                    const rollbackSide = request.option === 'YES' ? 'SELL' : 'BUY';
                    const rollbackResult = await placePolymarketHedge({
                        marketId: mapping.polymarketId,
                        conditionId: mapping.polymarketConditionId || mapping.polymarketId,
                        tokenId,
                        side: rollbackSide,
                        amount: request.amount, // Try to unwind the full amount
                        targetPrice: 0.5 // Market order logic handle price, just pass dummy
                    });

                    if (rollbackResult.success) {
                        console.log('[HedgeSimple] ✅ Rollback successful (Position closed). OrderId:', rollbackResult.orderId);
                        // Record the rollback to keep ledger clean? 
                        // For now, we just saved the house from exposure.
                    } else {
                        console.error('[HedgeSimple] ❌ ROLLBACK FAILED! MANUAL INTERVENTION REQUIRED.', rollbackResult.error);
                    }
                } catch (rollbackError) {
                    console.error('[HedgeSimple] ❌ ROLLBACK CRASHED:', rollbackError);
                }

                return {
                    success: false,
                    error: 'Trade failed. System attempted to reverse external position.',
                    errorCode: 'DATABASE',
                    polymarketOrderId: hedgeResult.orderId,
                };
            }

            userTradeOrderId = userTrade.orderId!;
        } else {
            console.log('[HedgeSimple] Skipping user trade creation (AMM already handled)');
            // Need to find the existing order created by AMM
            const existingOrder = await prisma.order.findFirst({
                where: {
                    userId: request.userId,
                    eventId: request.eventId,
                    option: request.option,
                    status: 'filled',
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true }
            });

            if (!existingOrder) {
                console.error('[HedgeSimple] CRITICAL: Could not find AMM order to link hedge!');
                return {
                    success: false,
                    error: 'Could not find order to link hedge',
                    errorCode: 'DATABASE',
                    polymarketOrderId: hedgeResult.orderId,
                };
            }

            userTradeOrderId = existingOrder.id;
        }

        // ========================================================================
        // STEP 7: Record Hedge Details
        // ========================================================================
        await recordHedge({
            userId: request.userId,
            userOrderId: userTradeOrderId,
            eventId: request.eventId,
            option: request.option,
            userAmount: request.amount,
            userPrice,
            polymarketOrderId: hedgeResult.orderId!,
            polymarketMarketId: mapping.polymarketId,
            polymarketTokenId: tokenId,
            polymarketSide: request.option === 'YES' ? 'BUY' : 'SELL',
            polymarketAmount: request.amount,
            polymarketPrice,
            polymarketFees: economics.fees,
            ourSpread: economics.spread,
            netProfit: economics.netProfit,
        });

        const totalTime = Date.now() - startTime;
        console.log(`[HedgeSimple] ✅ Complete in ${totalTime}ms - Profit: $${economics.netProfit.toFixed(4)}`);

        return {
            success: true,
            userOrderId: userTradeOrderId,
            userPrice,
            userAmount: request.amount,
            polymarketPrice,
            polymarketOrderId: hedgeResult.orderId,
            spread: economics.spread,
            netProfit: economics.netProfit,
        };

    } catch (error: any) {
        console.error('[HedgeSimple] Unexpected error:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            errorCode: 'DATABASE',
        };
    }
}

// ============================================================================
// Export Close Hedge Function
// ============================================================================

export { closeHedgePosition } from './hedge-close';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate request and fetch required data
 */
async function validateRequest(request: HedgeRequest): Promise<{
    valid: boolean;
    error?: string;
    event?: any;
    mapping?: PolymarketMapping;
    tokenId?: string;
}> {
    // Check order size
    const sizeCheck = validateOrderSize(request.amount);
    if (!sizeCheck.valid) {
        return { valid: false, error: sizeCheck.error };
    }

    // Check event exists and is active
    const event = await prisma.event.findUnique({
        where: { id: request.eventId },
        select: {
            id: true,
            status: true,
            source: true,
            polymarketId: true,
        },
    });

    if (!event) {
        return { valid: false, error: 'Event not found' };
    }

    if (event.status !== 'active') {
        return { valid: false, error: 'Event is not active' };
    }

    if (event.source !== 'POLYMARKET') {
        return { valid: false, error: 'Event is not a Polymarket event' };
    }

    // Get Polymarket mapping
    const mapping = await prisma.polymarketMarketMapping.findUnique({
        where: { internalEventId: request.eventId },
    });

    if (!mapping || !mapping.isActive) {
        return { valid: false, error: 'No active Polymarket mapping found' };
    }

    // Find token ID for the option (YES/NO)
    let tokenId = mapping.polymarketTokenId;

    if (mapping.outcomeMapping) {
        const outcomeData = (mapping.outcomeMapping as any)?.outcomes;
        if (Array.isArray(outcomeData)) {
            const targetOutcome = outcomeData.find((o: any) =>
                o.name?.toUpperCase() === request.option.toUpperCase()
            );
            if (targetOutcome?.polymarketId) {
                tokenId = targetOutcome.polymarketId;
            }
        }
    }

    if (!tokenId) {
        return { valid: false, error: `No Polymarket token ID found for ${request.option}` };
    }

    return {
        valid: true,
        event,
        mapping: mapping as PolymarketMapping,
        tokenId,
    };
}

/**
 * Fetch current Polymarket price from orderbook
 */
async function fetchPolymarketPrice(tokenId: string, side: 'YES' | 'NO'): Promise<number | null> {
    try {
        const orderbook = await Promise.race([
            polymarketTrading.getOrderbook(tokenId),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Orderbook fetch timeout')), HEDGE_CONFIG.timeout)
            ),
        ]);

        // For YES, we BUY, so we care about ask (what sellers want)
        // For NO, we SELL, so we care about bid (what buyers will pay)
        const price = side === 'YES'
            ? orderbook.asks[0]?.price
            : orderbook.bids[0]?.price;

        if (!price || price <= 0 || price >= 1) {
            console.error('[HedgeSimple] Invalid price from orderbook:', price);
            return null;
        }

        // Check if orderbook is stale
        const age = Date.now() - orderbook.timestamp;
        if (age > HEDGE_CONFIG.priceStaleThreshold) {
            console.warn(`[HedgeSimple] Orderbook is stale (${age}ms old)`);
            return null;
        }

        return price;
    } catch (error: any) {
        console.error('[HedgeSimple] Failed to fetch price:', error.message);
        return null;
    }
}

/**
 * Place hedge order on Polymarket
 */
async function placePolymarketHedge(params: {
    marketId: string;
    conditionId: string;
    tokenId: string;
    side: 'BUY' | 'SELL';
    amount: number;
    targetPrice: number;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
    const { marketId, conditionId, tokenId, side, amount, targetPrice } = params;

    try {
        // Use market order for fastest execution
        const order = await Promise.race([
            polymarketCircuit.execute(() =>
                polymarketTrading.placeMarketOrder(marketId, conditionId, tokenId, side, amount)
            ),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Hedge order timeout')), HEDGE_CONFIG.timeout)
            ),
        ]);

        return {
            success: true,
            orderId: order.orderId,
        };
    } catch (error: any) {
        console.error('[HedgeSimple] Hedge placement failed:', error.message);
        return {
            success: false,
            error: error.message || 'Unknown error',
        };
    }
}

/**
 * Execute user's trade in our database
 */
async function executeUserTrade(params: {
    userId: string;
    eventId: string;
    option: 'YES' | 'NO';
    amount: number;
    price: number;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
    const { userId, eventId, option, amount, price } = params;

    try {
        // Find or create outcome
        const outcome = await prisma.outcome.findFirst({
            where: {
                eventId,
                name: { equals: option, mode: 'insensitive' },
            },
        });

        // Create order
        const order = await prisma.order.create({
            data: {
                userId,
                eventId,
                outcomeId: outcome?.id || null,
                option,
                side: option === 'YES' ? 'buy' : 'sell',
                price,
                amount,
                amountFilled: amount,
                status: 'filled',
                orderType: 'market',
            },
        });

        return {
            success: true,
            orderId: order.id,
        };
    } catch (error: any) {
        console.error('[HedgeSimple] User trade failed:', error.message);
        return {
            success: false,
            error: error.message || 'Database error',
        };
    }
}

/**
 * Record hedge details for tracking and reconciliation
 */
async function recordHedge(params: {
    userId: string;
    userOrderId: string;
    eventId: string;
    option: string;
    userAmount: number;
    userPrice: number;
    polymarketOrderId: string;
    polymarketMarketId: string;
    polymarketTokenId: string;
    polymarketSide: string;
    polymarketAmount: number;
    polymarketPrice: number;
    polymarketFees: number;
    ourSpread: number;
    netProfit: number;
}) {
    try {
        await prisma.hedgeRecord.create({
            data: params,
        });
    } catch (error) {
        // Non-critical - log but don't fail the trade
        console.error('[HedgeSimple] Failed to record hedge (non-critical):', error);
    }
}

/**
 * Execute trade without hedge (fallback when Polymarket unavailable)
 * Only used when HEDGE_CONFIG.allowUnhedged = true
 */
async function executeUnhedgedTrade(request: HedgeRequest): Promise<HedgeResult> {
    console.warn('[HedgeSimple] Executing UNHEDGED trade (risky!)');

    // Use AMM price since we can't get Polymarket price
    const event = await prisma.event.findUnique({
        where: { id: request.eventId },
        select: { yesOdds: true, noOdds: true },
    });

    if (!event) {
        return {
            success: false,
            error: 'Event not found',
            errorCode: 'VALIDATION',
        };
    }

    const ammPrice = request.option === 'YES' ? event.yesOdds : event.noOdds;

    const userTrade = await executeUserTrade({
        userId: request.userId,
        eventId: request.eventId,
        option: request.option,
        amount: request.amount,
        price: ammPrice,
    });

    if (!userTrade.success) {
        return {
            success: false,
            error: userTrade.error,
            errorCode: 'DATABASE',
        };
    }

    return {
        success: true,
        userOrderId: userTrade.orderId,
        userPrice: ammPrice,
        userAmount: request.amount,
        // No polymarket data since unhedged
    };
}
