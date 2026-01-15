import { prisma } from '@/lib/prisma';
import { polymarketTrading } from '@/lib/polymarket-trading';

/**
 * Close an existing hedge position when user closes their position
 * Finds the original hedge and places an opposite order on Polymarket
 */
export async function closeHedgePosition(params: {
    userId: string;
    eventId: string;
    option: 'YES' | 'NO';
    amount: number;
    userOrderId: string;
}): Promise<{ success: boolean; realizedPnL?: number; error?: string }> {
    const { userId, eventId, option, amount, userOrderId } = params;
    const startTime = Date.now();

    try {
        console.log('[CloseHedge] Closing hedge for user position:', params);

        // Find the most recent open hedge for this user/event/option
        const openHedge = await prisma.hedgeRecord.findFirst({
            where: {
                userId,
                eventId,
                option: option === 'YES' ? 'NO' : 'YES', // Opposite of what they're trading now
                status: 'hedged',
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!openHedge) {
            console.warn('[CloseHedge] No open hedge found to close');
            return {
                success: false,
                error: 'No open hedge position found',
            };
        }

        console.log(`[CloseHedge] Found open hedge: ${openHedge.id}, original: ${openHedge.polymarketSide} ${openHedge.polymarketAmount} @ $${openHedge.polymarketPrice}`);

        // Get current PM price to close at
        const tokenId = openHedge.polymarketTokenId;
        const orderbook = await polymarketTrading.getOrderbook(tokenId);

        // If we originally BOUGHT, we now SELL (and vice versa)
        const closeSide = openHedge.polymarketSide === 'BUY' ? 'SELL' : 'BUY';
        const closePrice = closeSide === 'SELL'
            ? orderbook.bids[0]?.price  // Best bid to sell into
            : orderbook.asks[0]?.price;  // Best ask to buy from

        if (!closePrice) {
            return {
                success: false,
                error: 'No liquidity to close position',
            };
        }

        console.log(`[CloseHedge] Closing ${closeSide} @ $${closePrice.toFixed(4)}`);

        // Place closing order on Polymarket
        const closeOrder = await polymarketTrading.placeOrder({
            marketId: openHedge.polymarketMarketId,
            conditionId: openHedge.polymarketMarketId, // Fallback
            tokenId,
            side: closeSide,
            size: amount / closePrice, // Convert USD to shares
            price: closePrice,
        });

        if (!closeOrder.orderId) {
            return {
                success: false,
                error: 'Failed to place close order',
            };
        }

        // Calculate realized P/L
        const originalCost = openHedge.polymarketAmount * openHedge.polymarketPrice;
        const closeProceeds = amount; // User paid/received this

        // If we bought at $0.58 and sold at $0.56, we lost $0.02
        const hedgePnL = closeSide === 'SELL'
            ? (closePrice - openHedge.polymarketPrice) * openHedge.polymarketAmount
            : (openHedge.polymarketPrice - closePrice) * openHedge.polymarketAmount;

        console.log(`[CloseHedge] Hedge P/L: ${hedgePnL >= 0 ? '+' : ''}$${hedgePnL.toFixed(4)}`);

        // Update original HedgeRecord to mark as closed
        await prisma.hedgeRecord.update({
            where: { id: openHedge.id },
            data: {
                status: 'closed',
                // Store close details in error field for now (hack)
                error: `Closed @ ${closePrice.toFixed(4)} via ${closeOrder.orderId}`,
            },
        });

        // Create new HedgeRecord for the close trade
        await prisma.hedgeRecord.create({
            data: {
                userId,
                userOrderId,
                eventId,
                option,
                userAmount: amount,
                userPrice: closePrice,
                polymarketOrderId: closeOrder.orderId,
                polymarketMarketId: openHedge.polymarketMarketId,
                polymarketTokenId: tokenId,
                polymarketSide: closeSide,
                polymarketAmount: amount / closePrice,
                polymarketPrice: closePrice,
                polymarketFees: 0, // Estimate later
                ourSpread: 0, // Already captured on open
                netProfit: hedgePnL,
                status: 'hedged',
            },
        });

        const totalTime = Date.now() - startTime;
        console.log(`[CloseHedge] ✅ Complete in ${totalTime}ms - Realized P/L: $${hedgePnL.toFixed(4)}`);

        return {
            success: true,
            realizedPnL: hedgePnL,
        };

    } catch (error: any) {
        console.error('[CloseHedge] Error:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
        };
    }
}
