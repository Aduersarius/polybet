/**
 * Trade Orchestrator
 * 
 * Thin router that validates trades and delegates to appropriate execution module.
 * Currently routes 100% of trades to Polymarket hedging.
 * B-Book AMM can be enabled in the future.
 */

import { prisma } from './prisma';
import { RiskManager } from './risk-manager';

// Execution modules
import { executeVividPolymarketTrade } from './exchange/polymarket';
// import { executeBBookTrade } from './bbook-amm'; // Future

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
 * Execute a trade by routing to the appropriate execution module.
 */
export async function executeTrade(params: TradeParams): Promise<TradeResult> {
    const { userId, eventId, side, option, amount } = params;

    // 1. Validate event exists and is active
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
            id: true,
            status: true,
            source: true,
            polymarketId: true,
            type: true,
        }
    });

    if (!event) {
        return { success: false, error: 'Event not found', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
    }

    if (event.status !== 'ACTIVE') {
        return { success: false, error: 'Event is not active', totalFilled: 0, averagePrice: 0, executionModule: 'polymarket' };
    }

    // 2. Determine execution module
    const isPolymarketEvent = event.source === 'POLYMARKET' || !!event.polymarketId;

    // 3. Currently ALL trades go to Polymarket (100%)
    // In the future, internal events can route to B-Book
    if (isPolymarketEvent) {
        const result = await executeVividPolymarketTrade({
            userId,
            eventId,
            side,
            option,
            amountInUsd: amount,
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error,
                totalFilled: 0,
                averagePrice: 0,
                executionModule: 'polymarket'
            };
        }

        return {
            success: true,
            orderId: result.orderId,
            totalFilled: result.fillSize,
            averagePrice: result.fillPrice,
            fees: result.fees,
            executionModule: 'polymarket',
            trades: [{
                price: result.fillPrice,
                amount: result.fillSize,
                makerUserId: 'POLYMARKET',
                isAmmTrade: false
            }]
        };
    }

    // B-Book path (disabled for now)
    return {
        success: false,
        error: 'B-Book trading is currently disabled. Only Polymarket events are supported.',
        totalFilled: 0,
        averagePrice: 0,
        executionModule: 'bbook',
    };
}
