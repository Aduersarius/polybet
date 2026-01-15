
import { polymarketTrading } from '@/lib/polymarket-trading';
import { Quote } from './quote';

export interface ExecutionResult {
    orderId: string;
    fillPrice: number;
    fillSize: number;
    fees: number;
    filled: boolean;
    status: string;
}

/**
 * Executes the actual order on Polymarket CLOB and waits for fill
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

        console.log(`[Vivid-Executor] ✅ Order placed: ${order.orderId.slice(0, 16)}... - Monitoring fill status...`);

        // Wait up to 10 seconds for order to fill
        const fillResult = await polymarketTrading.waitForOrderFill(order.orderId, 10000, 1000);

        console.log(
            `[Vivid-Executor] Fill Status: ${fillResult.status} | ` +
            `Filled: ${fillResult.filledSize.toFixed(2)}/${quote.shares.toFixed(2)} shares ` +
            `(${((fillResult.filledSize / quote.shares) * 100).toFixed(0)}%)`
        );

        if (!fillResult.filled && fillResult.status === 'TIMEOUT') {
            console.warn(
                `[Vivid-Executor] ⚠️ Limit order NOT filled within 10s. ` +
                `Order is OPEN at price ${quote.price.toFixed(4)} waiting for counterparty. ` +
                `This is NORMAL for limit orders in illiquid markets.`
            );
        }

        const fees = (fillResult.filledSize * fillResult.avgPrice) * 0.0002; // Use actual fill price

        return {
            orderId: order.orderId,
            fillPrice: fillResult.avgPrice || quote.price,
            fillSize: fillResult.filledSize,
            fees,
            filled: fillResult.filled,
            status: fillResult.status
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
