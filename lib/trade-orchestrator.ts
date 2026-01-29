/**
 * Trade Orchestrator - SIMPLIFIED (KISS)
 * 
 * Direct Polymarket trading for hybrid-trading API.
 * No complex pipelines, just: validate → execute on PM → record
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { polymarketTrading } from './polymarket-trading';
import { PLATFORM_MARKUP } from './constants';

export interface TradeParams {
    userId: string;
    eventId: string;
    side: 'buy' | 'sell';
    option: string; // YES/NO or outcomeId
    amount: number; // USD
    price?: number; // Optional limit price
}

export interface TradeResult {
    success: boolean;
    orderId?: string;
    totalFilled: number;
    averagePrice: number;
    fees?: number;
    error?: string;
    warning?: string;
    trades?: any[];
    executionModule: 'polymarket' | 'bbook';
}

/**
 * Execute DEMO trade - simple local bookkeeping only
 * No Polymarket, no hedging, just record the order and update balances
 */
async function executeDemoTrade(params: TradeParams): Promise<TradeResult> {
    const { userId, eventId, side, option, amount } = params;

    try {
        console.log(`[DEMO Trade] ${side.toUpperCase()} $${amount} ${option} on ${eventId}`);

        // 1. Validate event exists
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, status: true, type: true }
        });

        if (!event) {
            return { success: false, error: 'Event not found', totalFilled: 0, averagePrice: 0, executionModule: 'bbook' };
        }

        if (event.status !== 'ACTIVE') {
            return { success: false, error: 'Event is not active', totalFilled: 0, averagePrice: 0, executionModule: 'bbook' };
        }

        // 2. Get outcome for proper outcomeId
        const outcome = await prisma.outcome.findFirst({
            where: { eventId, name: { equals: option, mode: 'insensitive' } },
        });

        // 3. Simple pricing: assume 50/50 odds for demo (or could fetch real odds)
        const demoPrice = 0.50; // Simplified - could use real odds from event
        const shares = amount / demoPrice;

        // 4. Execute in transaction
        const result = await prisma.$transaction(async (tx: any) => {
            // A. For BUY: Check and deduct DEMO TUSD balance
            if (side === 'buy') {
                const balance = await tx.balance.findFirst({
                    where: { userId, tokenSymbol: 'TUSD', eventId: null, accountType: 'DEMO' }
                });

                const available = balance?.amount ? Number(balance.amount) : 0;

                if (available < amount) {
                    throw new Error(`Insufficient DEMO balance. You need $${amount.toFixed(2)} but have $${available.toFixed(2)}`);
                }

                // Deduct TUSD
                if (balance) {
                    await tx.balance.update({
                        where: { id: balance.id },
                        data: { amount: { decrement: amount } }
                    });
                } else {
                    throw new Error('DEMO balance not initialized');
                }

                // Credit shares
                const shareSymbol = `${option}_TOKEN`;
                await tx.balance.upsert({
                    where: {
                        userId_tokenSymbol_eventId_outcomeId_accountType: {
                            userId,
                            tokenSymbol: shareSymbol,
                            eventId,
                            outcomeId: outcome?.id || '',
                            accountType: 'DEMO'
                        }
                    },
                    update: { amount: { increment: shares } },
                    create: {
                        userId,
                        tokenSymbol: shareSymbol,
                        eventId,
                        outcomeId: outcome?.id,
                        amount: shares,
                        accountType: 'DEMO'
                    }
                });
            } else {
                // SELL: Check shares, credit TUSD
                const shareSymbol = `${option}_TOKEN`;
                const shareBalance = await tx.balance.findFirst({
                    where: { userId, tokenSymbol: shareSymbol, eventId, accountType: 'DEMO' }
                });

                const availableShares = shareBalance?.amount ? Number(shareBalance.amount) : 0;

                if (availableShares < shares) {
                    throw new Error(`Insufficient shares. You need ${shares.toFixed(2)} but have ${availableShares.toFixed(2)}`);
                }

                // Deduct shares
                await tx.balance.update({
                    where: { id: shareBalance!.id },
                    data: { amount: { decrement: shares } }
                });

                // Credit TUSD
                await tx.balance.upsert({
                    where: {
                        userId_tokenSymbol_eventId_outcomeId_accountType: {
                            userId,
                            tokenSymbol: 'TUSD',
                            eventId: null,
                            outcomeId: null,
                            accountType: 'DEMO'
                        }
                    },
                    update: { amount: { increment: amount } },
                    create: {
                        userId,
                        tokenSymbol: 'TUSD',
                        amount,
                        accountType: 'DEMO'
                    }
                });
            }

            // B. Create order record
            const order = await tx.order.create({
                data: {
                    userId,
                    eventId,
                    outcomeId: outcome?.id ?? null,
                    option,
                    side,
                    price: demoPrice,
                    amount,
                    amountFilled: shares,
                    status: 'filled',
                    orderType: 'market',
                    accountType: 'DEMO'
                }
            });

            // C. Create market activity
            await tx.marketActivity.create({
                data: {
                    userId,
                    eventId,
                    outcomeId: outcome?.id,
                    type: 'TRADE',
                    option,
                    side: side.toUpperCase(),
                    amount,
                    price: demoPrice,
                    isAmmInteraction: true,
                    orderId: order.id,
                    accountType: 'DEMO'
                }
            });

            return { orderId: order.id };
        });

        console.log(`[DEMO Trade] ✅ Order ${result.orderId} - ${shares.toFixed(2)} shares @ $${demoPrice}`);

        return {
            success: true,
            orderId: result.orderId,
            totalFilled: shares,
            averagePrice: demoPrice,
            executionModule: 'bbook',
            trades: [{
                price: demoPrice,
                amount: shares,
                makerUserId: 'DEMO_AMM',
                isAmmTrade: true
            }]
        };

    } catch (error: any) {
        console.error('[DEMO Trade] Failed:', error.message);
        return {
            success: false,
            error: error.message || 'DEMO trade failed',
            totalFilled: 0,
            averagePrice: 0,
            executionModule: 'bbook'
        };
    }
}

/**
 * Execute a trade directly on Polymarket.
 * Simple flow: validate → get PM mapping → place order on PM → create internal order
 */
export async function executeTrade(params: TradeParams): Promise<TradeResult> {
    const { userId, eventId, side, option, amount, price } = params;

    // 0. Check if user is in DEMO mode
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { accountMode: true }
    });

    if (user?.accountMode === 'DEMO') {
        // DEMO MODE: Simple local bookkeeping only, NO Polymarket
        return executeDemoTrade(params);
    }

    // LIVE MODE: Full Polymarket trading flow
    // 1. Validate event & Minimum Amount
    if (amount < 1.1) {
        console.warn(`[DirectTrade] Amount $${amount} is below Polymarket $1.00 minimum + buffer. Bumping to $1.10`);
    }
    const effectiveAmount = Math.max(1.1, amount);

    try {
        console.log(`[DirectTrade] ${side.toUpperCase()} $${effectiveAmount} ${option} on ${eventId}`);

        // 1. Validate event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, status: true, source: true, type: true }
        });

        if (!event) {
            return { success: false, error: 'Event not found', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
        }

        if (event.status !== 'ACTIVE') {
            return { success: false, error: 'Event is not active', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
        }

        if (event.source !== 'POLYMARKET') {
            return { success: false, error: 'Only Polymarket events supported', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
        }

        // 2. Get Polymarket mapping
        const mapping = await prisma.polymarketMarketMapping.findUnique({
            where: { internalEventId: eventId },
        });

        if (!mapping || !mapping.isActive) {
            return { success: false, error: 'No active Polymarket mapping', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
        }

        // 3. Determine token ID
        let tokenId = mapping.polymarketTokenId;

        if (mapping.outcomeMapping) {
            const outcomeData = (mapping.outcomeMapping as any)?.outcomes;
            if (Array.isArray(outcomeData)) {
                const targetOutcome = outcomeData.find((o: any) =>
                    o.name?.toUpperCase() === option.toUpperCase()
                );
                if (targetOutcome?.polymarketId) {
                    tokenId = targetOutcome.polymarketId;
                }
            }
        }

        if (!tokenId) {
            return { success: false, error: `No Polymarket token ID for ${option}`, totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
        }

        // 4. Get current price from orderbook to convert USD to shares
        const orderbook = await polymarketTrading.getOrderbook(tokenId);
        const pmSide = side === 'buy' ? 'BUY' : 'SELL';

        // For BUY, we care about asks (what sellers want)
        // For SELL, we care about bids (what buyers will pay)
        const levels = pmSide === 'BUY' ? orderbook.asks : orderbook.bids;

        if (levels.length === 0) {
            return { success: false, error: 'No liquidity available', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
        }

        const currentPrice = levels[0].price;

        // Convert USD amount to shares: shares = USD / price_per_share
        const shares = amount / currentPrice;

        console.log(`[DirectTrade] Converting $${amount} @ $${currentPrice.toFixed(4)}/share = ${shares.toFixed(2)} shares`);

        // 5. For SELL orders, verify user has enough shares and get exact amount
        let sharesToTrade = shares;
        if (side === 'sell') {
            const tokenSymbol = `${option}_TOKEN`;
            const userBalance = await prisma.balance.findFirst({
                where: {
                    userId,
                    tokenSymbol,
                    eventId,
                },
                select: { amount: true },
            });

            const availableShares = userBalance?.amount ? Number(userBalance.amount) : 0;

            if (availableShares <= 0) {
                return {
                    success: false,
                    error: 'You don\'t own any shares to sell',
                    totalFilled: 0,
                    averagePrice: 0,
                    executionModule: 'polymarket',
                };
            }

            // Calculate how many shares the USD amount represents
            const requestedShares = amount / currentPrice;

            // Use the minimum of what they want to sell and what they have
            sharesToTrade = Math.min(requestedShares, availableShares);

            console.log(`[DirectTrade] User has ${availableShares.toFixed(2)} shares, selling ${sharesToTrade.toFixed(2)}`);
        }

        // 6. For BUY orders, verify user has enough TUSD (USD equivalent) balance
        let balanceBefore = 0;
        if (side === 'buy') {
            const userBalance = await prisma.balance.findFirst({
                where: { userId, tokenSymbol: 'TUSD', eventId: null },
            });

            const availableFunds = userBalance?.amount ? Number(userBalance.amount) : 0;
            balanceBefore = availableFunds;

            if (availableFunds < effectiveAmount) {
                return {
                    success: false,
                    error: `Insufficient balance. You need $${effectiveAmount.toFixed(2)} but have $${availableFunds.toFixed(2)}`,
                    totalFilled: 0,
                    averagePrice: 0,
                    executionModule: 'polymarket',
                };
            }
        }

        // 7. Place order on Polymarket
        let pmOrder;
        // ... (existing order placement logic unchanged until the end of the order placement)
        if (price) {
            // Limit order - use user's specified price
            const limitShares = side === 'sell' ? sharesToTrade : amount / price;
            pmOrder = await polymarketTrading.placeOrder({
                marketId: mapping.polymarketId,
                conditionId: mapping.polymarketConditionId || mapping.polymarketId,
                tokenId,
                side: pmSide,
                size: limitShares,
                price,
            });
        } else {
            // Market order - use aggressive pricing
            const aggressivePrice = pmSide === 'BUY'
                ? Math.min(0.99, (levels[0]?.price || 0.5) * 1.05) // 5% buffer for market order to ensure success
                : Math.max(0.01, (levels[0]?.price || 0.5) * 0.95);

            const adjustedShares = side === 'sell' ? sharesToTrade : effectiveAmount / aggressivePrice;

            pmOrder = await polymarketTrading.placeOrder({
                marketId: mapping.polymarketId,
                conditionId: mapping.polymarketConditionId || mapping.polymarketId,
                tokenId,
                side: pmSide,
                size: adjustedShares,
                price: aggressivePrice,
                tickSize: orderbook.tickSize,
                negRisk: orderbook.negRisk,
            });
        }

        console.log(`[DirectTrade] ✅ PM Order: ${pmOrder.orderId} - ${pmOrder.size} shares @ $${pmOrder.price}`);

        // 8. Apply platform markup (3%)
        const pmExecutionPrice = Number(pmOrder.price);
        const userPrice = side === 'buy'
            ? pmExecutionPrice * (1 + PLATFORM_MARKUP)
            : pmExecutionPrice * (1 - PLATFORM_MARKUP);

        const filledSize = Number(pmOrder.filledSize || pmOrder.size);
        const userCost = filledSize * userPrice;
        const pmCost = filledSize * pmExecutionPrice;
        const platformProfit = side === 'buy' ? userCost - pmCost : pmCost - userCost;

        // 9. ATOMIC EXECUTION: Update internal records and deduct/credit balances
        const outcome = await prisma.outcome.findFirst({
            where: { eventId, name: { equals: option, mode: 'insensitive' } },
        });

        const result = await prisma.$transaction(async (txPrisma: any) => {

            // A. Create Order
            const internalOrder = await txPrisma.order.create({
                data: {
                    userId,
                    eventId,
                    outcomeId: outcome?.id ?? null,
                    option,
                    side,
                    price: userPrice,
                    amount: userCost,
                    amountFilled: filledSize,
                    status: 'filled',
                    orderType: price ? 'limit' : 'market',
                },
            });

            // B. Create Ledger Entry & Deduct/Credit Funds
            if (side === 'buy') {
                // Deduct TUSD
                const balanceAfter = balanceBefore - userCost;
                await txPrisma.balance.updateMany({
                    where: { userId, tokenSymbol: 'TUSD', eventId: null },
                    data: { amount: { decrement: userCost } }
                });

                // Update legacy balance too
                await txPrisma.user.update({
                    where: { id: userId },
                    data: { currentBalance: { decrement: userCost } }
                });

                await txPrisma.ledgerEntry.create({
                    data: {
                        userId,
                        direction: 'DEBIT',
                        amount: new Prisma.Decimal(userCost),
                        currency: 'USD',
                        referenceType: 'TRADE',
                        referenceId: internalOrder.id,
                        balanceBefore: new Prisma.Decimal(balanceBefore),
                        balanceAfter: new Prisma.Decimal(balanceAfter),
                        metadata: { description: `Buy ${option} on ${eventId}`, shares: filledSize, price: userPrice }
                    }
                });
            } else {
                // For SELL, credit TUSD
                const userTusd = await txPrisma.balance.findFirst({
                    where: { userId, tokenSymbol: 'TUSD', eventId: null }
                });
                const tusdBefore = userTusd?.amount ? Number(userTusd.amount) : 0;
                const tusdAfter = tusdBefore + userCost;

                if (userTusd) {
                    await txPrisma.balance.update({ where: { id: userTusd.id }, data: { amount: { increment: userCost } } });
                } else {
                    await txPrisma.balance.create({ data: { userId, tokenSymbol: 'TUSD', amount: userCost, locked: 0 } });
                }

                await txPrisma.user.update({ where: { id: userId }, data: { currentBalance: { increment: userCost } } });

                await txPrisma.ledgerEntry.create({
                    data: {
                        userId,
                        direction: 'CREDIT',
                        amount: new Prisma.Decimal(userCost),
                        currency: 'USD',
                        referenceType: 'TRADE',
                        referenceId: internalOrder.id,
                        balanceBefore: new Prisma.Decimal(tusdBefore),
                        balanceAfter: new Prisma.Decimal(tusdAfter),
                        metadata: { description: `Sell ${option} on ${eventId}`, shares: filledSize, price: userPrice }
                    }
                });
            }

            // C. Update Shares Balance
            const shareSymbol = `${option}_TOKEN`;
            const sharesDelta = side === 'buy' ? filledSize : -filledSize;

            await txPrisma.balance.upsert({
                where: {
                    userId_tokenSymbol_eventId_outcomeId: {
                        userId,
                        tokenSymbol: shareSymbol,
                        eventId,
                        outcomeId: outcome?.id || '',
                    },
                },
                update: { amount: { increment: sharesDelta } },
                create: {
                    userId,
                    tokenSymbol: shareSymbol,
                    amount: Math.max(0, sharesDelta),
                    eventId,
                    outcomeId: outcome?.id,
                },
            });

            // D. Create Hedge Record
            await txPrisma.hedgeRecord.create({
                data: {
                    userId,
                    userOrderId: internalOrder.id,
                    eventId,
                    option: option as 'YES' | 'NO',
                    userAmount: userCost,
                    userPrice: userPrice,
                    polymarketMarketId: mapping.polymarketId,
                    polymarketOrderId: pmOrder.orderId,
                    polymarketSide: pmSide,
                    polymarketPrice: pmExecutionPrice,
                    polymarketAmount: filledSize,
                    polymarketTokenId: tokenId,
                    status: 'hedged',
                    polymarketFees: 0,
                    netProfit: platformProfit,
                    ourSpread: PLATFORM_MARKUP * 100,
                }
            });

            return { orderId: internalOrder.id, userPrice, userCost };
        });

        return {
            success: true,
            orderId: result.orderId,
            totalFilled: filledSize,
            averagePrice: result.userPrice,
            fees: 0,
            executionModule: 'polymarket',
            trades: [{
                price: result.userPrice,
                amount: filledSize,
                makerUserId: 'POLYMARKET',
                isAmmTrade: false
            }]
        };

    } catch (error: any) {
        console.error('[DirectTrade] Failed:', error.message);
        return {
            success: false,
            error: error.message || 'Trade execution failed',
            totalFilled: 0,
            averagePrice: 0,
            executionModule: 'polymarket',
        };
    }
}
