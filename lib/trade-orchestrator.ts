/**
 * Trade Orchestrator - SIMPLIFIED (KISS)
 * 
 * Direct Polymarket trading for hybrid-trading API.
 * No complex pipelines, just: validate → execute on PM → record
 */

import { prisma } from './prisma';
import { polymarketTrading } from './polymarket-trading';

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
 * Execute a trade directly on Polymarket.
 * Simple flow: validate → get PM mapping → place order on PM → create internal order
 */
export async function executeTrade(params: TradeParams): Promise<TradeResult> {
    const { userId, eventId, side, option, amount, price } = params;

    try {
        console.log(`[DirectTrade] ${side.toUpperCase()} $${amount} ${option} on ${eventId}`);

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

            if (availableFunds < amount) {
                return {
                    success: false,
                    error: `Insufficient balance. You need $${amount.toFixed(2)} but have $${availableFunds.toFixed(2)}`,
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
                ? Math.min(0.99, (levels[0]?.price || 0.5) * 1.02)
                : Math.max(0.01, (levels[0]?.price || 0.5) * 0.98);

            const adjustedShares = side === 'sell' ? sharesToTrade : amount / aggressivePrice;

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
        const PLATFORM_MARKUP = 0.03;
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
                        amount: new prisma.Prisma.Decimal(userCost),
                        currency: 'USD',
                        referenceType: 'TRADE',
                        referenceId: internalOrder.id,
                        balanceBefore: new prisma.Prisma.Decimal(balanceBefore),
                        balanceAfter: new prisma.Prisma.Decimal(balanceAfter),
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
                        amount: new prisma.Prisma.Decimal(userCost),
                        currency: 'USD',
                        referenceType: 'TRADE',
                        referenceId: internalOrder.id,
                        balanceBefore: new prisma.Prisma.Decimal(tusdBefore),
                        balanceAfter: new prisma.Prisma.Decimal(tusdAfter),
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
