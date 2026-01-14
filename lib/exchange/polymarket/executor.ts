
import { polymarketTrading } from '@/lib/polymarket-trading';
import { Quote } from './quote';

export interface ExecutionResult {
    orderId: string;
    fillPrice: number;
    fillSize: number;
    fees: number;
}

/**
 * Executes the actual order on Polymarket CLOB
 */
export async function executePolymarketOrder(
    marketId: string,
    conditionId: string,
    quote: Quote
): Promise<ExecutionResult> {
    try {
        console.log(`[Vivid-Executor] Executing ${quote.side} ${quote.shares.toFixed(6)} shares @ ${quote.price}`);

        const order = await polymarketTrading.placeOrder({
            marketId,
            conditionId,
            tokenId: quote.tokenId,
            side: quote.side,
            size: quote.shares,
            price: quote.price,
            tickSize: quote.tickSize as any,
            negRisk: quote.negRisk
        });

        if (!order.orderId) {
            throw new Error('Polymarket execution failed: No orderId returned');
        }

        const fees = (quote.shares * quote.price) * 0.0002; // Estimate 0.02% fee if not provided

        return {
            orderId: order.orderId,
            fillPrice: order.price || quote.price,
            fillSize: order.size || quote.shares,
            fees
        };
    } catch (error: any) {
        // Normalize error messages (Bulletproof)
        const msg = error.message || 'Unknown execution error';
        if (msg.includes('min size: $1')) {
            throw new Error('Polymarket rejected order: Value fell below $1.00 after rounding.');
        }
        throw error;
    }
}
