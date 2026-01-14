
import { resolvePolymarketContext } from './resolver';
import { getExecutionQuote, validateUserBalance } from './quote';
import { executePolymarketOrder } from './executor';
import { persistTradePipeline, AccountingContext } from './accounting';
import { RiskManager } from '@/lib/risk-manager';

export * from './settlement';

export interface TradeRequest extends AccountingContext { }

/**
 * THE VIVID PIPELINE: Identify -> Assess -> Execute -> Persist
 */
export async function executeVividPolymarketTrade(req: TradeRequest) {
    console.log(`[Vivid-Pipeline] 🚀 Starting trade for ${req.userId} on ${req.eventId} (${req.option})`);

    try {
        const market = await resolvePolymarketContext(req.eventId, req.option);
        console.log(`[Vivid-Pipeline] 📍 Resolved Market: ${market.polymarketId} (Token: ${market.tokenId.slice(-8)})`);

        // 1b. Fetch platform probability for divergence check
        const outcome = await prisma.outcome.findFirst({
            where: {
                OR: [
                    { id: req.option },
                    {
                        eventId: req.eventId,
                        name: { equals: req.option, mode: 'insensitive' }
                    }
                ]
            }
        });
        const platformProb = outcome?.probability ? (outcome.probability instanceof Object ? (outcome.probability as any).toNumber() : outcome.probability) : null;
        console.log(`[Vivid-Pipeline] ⚖️ Platform Prob: ${platformProb || 'N/A'}`);

        // 2. Assess Price & Thresholds (Quote)
        const quote = await getExecutionQuote(
            market.tokenId,
            req.side.toUpperCase() as 'BUY' | 'SELL',
            req.amountInUsd
        );
        console.log(`[Vivid-Pipeline] 📊 Quote Ready: ${quote.shares.toFixed(4)} shares @ ${quote.price}`);

        // 3. Risk & Balance Validation (Safety)
        const riskCheck = await RiskManager.validateTrade(
            req.userId,
            req.eventId,
            req.amountInUsd,
            req.side,
            req.option,
            platformProb || quote.price, // Use platform price for slippage check if available, else fall back
            quote.price // Market orders have same predicted price
        );

        if (!riskCheck.allowed) {
            console.warn(`[Vivid-Pipeline] 🛡️ Risk check REJECTED: ${riskCheck.reason}`);
            throw new Error(`Risk check failed: ${riskCheck.reason}`);
        }

        await validateUserBalance(
            req.userId,
            req.side,
            req.side === 'buy' ? req.amountInUsd : quote.shares,
            req.eventId,
            req.option
        );

        // 4. Execute Exchange Order (Executor)
        const execution = await executePolymarketOrder(
            market.polymarketId,
            market.polymarketConditionId,
            quote
        );
        console.log(`[Vivid-Pipeline] ⚡ Executed: ${execution.orderId}`);

        // 4. Persist to Ledger (Accounting)
        const result = await persistTradePipeline(req, market, execution);
        console.log(`[Vivid-Pipeline] ✅ Persisted: ${result.orderId}`);

        return {
            success: true,
            ...execution,
            ...result
        };
    } catch (error: any) {
        console.error(`[Vivid-Pipeline] ❌ Pipeline Failed:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}
