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

        // 5. Place order on Polymarket with SHARES, not USD
        let pmOrder;
        if (price) {
            // Limit order - use user's specified price
            const limitShares = amount / price;
            pmOrder = await polymarketTrading.placeOrder({
                marketId: mapping.polymarketId,
                conditionId: mapping.polymarketConditionId || mapping.polymarketId,
                tokenId,
                side: pmSide,
                size: limitShares, // Convert USD to shares
                price,
            });
        } else {
            // Market order - use calculated shares and aggressive price
            // Price aggressively for fast fill but reasonably close to market to save collateral
            // levels[0] is always the best price (lowest Ask for BUY, highest Bid for SELL)
            // We add 2% slippage tolerance to ensure fill (reduced from 5% to avoid high slippage warnings)
            const aggressivePrice = pmSide === 'BUY'
                ? Math.min(0.99, (levels[0]?.price || 0.5) * 1.02)
                : Math.max(0.01, (levels[0]?.price || 0.5) * 0.98);

            pmOrder = await polymarketTrading.placeOrder({
                marketId: mapping.polymarketId,
                conditionId: mapping.polymarketConditionId || mapping.polymarketId,
                tokenId,
                side: pmSide,
                size: shares, // Pre-calculated shares
                price: aggressivePrice, // Aggressive limit price
                tickSize: orderbook.tickSize,
                negRisk: orderbook.negRisk,
            });
        }

        console.log(`[DirectTrade] ✅ PM Order: ${pmOrder.orderId} - ${pmOrder.size} shares @ $${pmOrder.price}`);

        // 6. Create internal order record
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
                price: pmOrder.price,
                amount: amount, // Original USD amount
                amountFilled: pmOrder.filledSize || pmOrder.size, // Shares filled
                status: 'filled',
                orderType: price ? 'limit' : 'market',
            },
        });

        // 7. Create Hedge Record (for Dashboard visibility)
        const costBasis = Number(pmOrder.size) * Number(pmOrder.price);
        // For Direct Trades, "profit" is essentially the slippage difference (positive or negative)
        // User paid 'amount', we paid 'costBasis'
        const tradeProfit = amount - costBasis;

        await prisma.hedgeRecord.create({
            data: {
                userId,
                userOrderId: internalOrder.id,
                eventId,
                option: option as 'YES' | 'NO',
                userAmount: amount, // Revenue (what user paid/committed)
                userPrice: Number(pmOrder.price), // User gets same price as PM

                polymarketMarketId: mapping.polymarketId,
                // polymarketOrderType not in schema, removing
                polymarketOrderId: pmOrder.orderId,
                polymarketSide: pmSide,
                polymarketPrice: Number(pmOrder.price),
                polymarketAmount: Number(pmOrder.size), // Shares
                polymarketTokenId: tokenId,

                status: 'hedged',
                polymarketFees: 0, // Assume 0 or update later
                netProfit: tradeProfit,
                ourSpread: 0, // No spread charged on direct trading
            }
        });

        return {
            success: true,
            orderId: internalOrder.id,
            totalFilled: pmOrder.size,
            averagePrice: pmOrder.price,
            fees: 0, // PM fees handled separately
            executionModule: 'polymarket',
            trades: [{
                price: pmOrder.price,
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
