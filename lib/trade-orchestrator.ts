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

        // 6. Place order on Polymarket with SHARES, not USD
        let pmOrder;
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
            // Calculate aggressive price first
            const aggressivePrice = pmSide === 'BUY'
                ? Math.min(0.99, (levels[0]?.price || 0.5) * 1.02)
                : Math.max(0.01, (levels[0]?.price || 0.5) * 0.98);

            // For BUY: Calculate shares to ensure collateral >= $1
            // For SELL: Use exact shares from user's balance
            const adjustedShares = side === 'sell' ? sharesToTrade : amount / aggressivePrice;

            console.log(`[DirectTrade] Market order: ${pmSide} ${adjustedShares.toFixed(2)} shares @ $${aggressivePrice.toFixed(4)} (value: $${(adjustedShares * aggressivePrice).toFixed(4)})`);

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

        // 6. Apply platform markup (brokerage fee)
        const PLATFORM_MARKUP = 0.03; // 3% markup on PM price
        const pmExecutionPrice = Number(pmOrder.price);
        const userPrice = side === 'buy'
            ? pmExecutionPrice * (1 + PLATFORM_MARKUP)  // User pays MORE when buying
            : pmExecutionPrice * (1 - PLATFORM_MARKUP); // User gets LESS when selling

        const userCost = Number(pmOrder.filledSize || pmOrder.size) * userPrice;
        const pmCost = Number(pmOrder.filledSize || pmOrder.size) * pmExecutionPrice;
        const platformProfit = side === 'buy'
            ? userCost - pmCost  // We charge more than we paid
            : pmCost - userCost; // We paid more than we gave user

        console.log(`[DirectTrade] 💰 Markup: User ${side === 'buy' ? 'pays' : 'receives'} $${userCost.toFixed(4)} vs PM $${pmCost.toFixed(4)} = Profit: $${platformProfit.toFixed(4)}`);

        // 7. Create internal order record
        const outcome = await prisma.outcome.findFirst({
            where: { eventId, name: { equals: option, mode: 'insensitive' } },
        });

        const internalOrder = await prisma.order.create({
            data: {
                userId,
                eventId,
                outcomeId: outcome?.id ?? null,
                option,
                side,
                price: userPrice, // User sees marked-up price
                amount: userCost, // User pays marked-up amount
                amountFilled: pmOrder.filledSize || pmOrder.size,
                status: 'filled',
                orderType: price ? 'limit' : 'market',
            },
        });

        // 8. Create Hedge Record (track profitability)
        await prisma.hedgeRecord.create({
            data: {
                userId,
                userOrderId: internalOrder.id,
                eventId,
                option: option as 'YES' | 'NO',
                userAmount: userCost, // What user actually paid (with markup)
                userPrice: userPrice, // Price user saw (with markup)

                polymarketMarketId: mapping.polymarketId,
                polymarketOrderId: pmOrder.orderId,
                polymarketSide: pmSide,
                polymarketPrice: pmExecutionPrice,
                polymarketAmount: Number(pmOrder.size),
                polymarketTokenId: tokenId,

                status: 'hedged',
                polymarketFees: 0, // PM fees not tracked yet
                netProfit: platformProfit, // Our 3% markup profit
                ourSpread: PLATFORM_MARKUP * 100, // 3% in basis points
            }
        });

        // 8. Update user's Balance for trading panel
        const tokenSymbol = `${option}_TOKEN`;
        const sharesDelta = side === 'buy'
            ? Number(pmOrder.filledSize || pmOrder.size)  // Add shares
            : -Number(pmOrder.filledSize || pmOrder.size); // Remove shares

        await prisma.balance.upsert({
            where: {
                userId_tokenSymbol_eventId_outcomeId: {
                    userId,
                    tokenSymbol,
                    eventId,
                    outcomeId: outcome?.id || null,
                },
            },
            update: {
                amount: {
                    increment: sharesDelta,
                },
            },
            create: {
                userId,
                tokenSymbol,
                amount: Math.max(0, sharesDelta), // Can't have negative balance
                eventId,
                outcomeId: outcome?.id,
            },
        });

        console.log(`[DirectTrade] Updated balance: ${side === 'buy' ? '+' : ''}${sharesDelta.toFixed(2)} shares of ${option}`);

        return {
            success: true,
            orderId: internalOrder.id,
            totalFilled: pmOrder.size,
            averagePrice: userPrice, // User sees marked-up price
            fees: 0,
            executionModule: 'polymarket',
            trades: [{
                price: userPrice, // User sees marked-up price
                amount: pmOrder.size,
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
