import { prisma } from './prisma';

const GLOBAL_LIABILITY_CAP = 50000000; // $50M (increased for testing with existing data)
const EVENT_LIABILITY_CAP = 50000000;   // $50M (increased for testing with existing data)
const MAX_SLIPPAGE = 0.10;          // 10%
const AMM_BOT_USER_ID = 'cminhk477000002s8jld69y1f';

export class RiskManager {
    /**
     * Validates a trade against risk rules:
     * 1. Global Liability Cap
     * 2. Event Liability Cap
     * 3. Slippage Cap
     */
    static async validateTrade(
        eventId: string,
        amount: number, // USD amount to spend
        side: 'buy' | 'sell',
        option: string, // Outcome ID or 'YES'/'NO'
        currentProb: number, // Current spot price/probability
        predictedProb: number // Predicted spot price/probability after trade
    ): Promise<{ allowed: boolean; reason?: string }> {

        // 1. Check Slippage Cap
        // Calculate percentage change in price
        const priceChange = Math.abs(predictedProb - currentProb);

        // Handle edge case: if currentProb is 0 or very small, skip slippage check
        // (this can happen for new events or outcomes with very low probability)
        if (currentProb > 0.01) {
            const slippage = priceChange / currentProb;

            if (slippage > MAX_SLIPPAGE) {
                return {
                    allowed: false,
                    reason: `Slippage too high: ${(slippage * 100).toFixed(2)}% (Max ${MAX_SLIPPAGE * 100}%)`
                };
            }
        }

        // 2. Check Event Liability Cap
        // Liability = Max potential payout for this event
        // We need to calculate the NEW liability if this trade goes through.
        // Since we don't want to simulate the whole DB state, we'll check current liability + max potential addition.
        // Max addition for a BUY is roughly amount / price (shares bought).
        // But strictly, we should check the actual shares.
        // For now, let's check the CURRENT liability first.

        const eventLiability = await this.calculateEventLiability(eventId);

        // Estimate new shares (worst case: amount / currentProb)
        // If side is 'sell', liability decreases, so we are safe.
        if (side === 'buy') {
            const estimatedShares = amount / currentProb; // Rough estimate
            if (eventLiability + estimatedShares > EVENT_LIABILITY_CAP) {
                return {
                    allowed: false,
                    reason: `Event liability cap exceeded. Current: $${eventLiability.toFixed(2)}, Cap: $${EVENT_LIABILITY_CAP}`
                };
            }
        }

        // 3. Check Global Liability Cap
        // Sum of all event liabilities
        const globalLiability = await this.calculateGlobalLiability();

        if (side === 'buy') {
            const estimatedShares = amount / currentProb;
            if (globalLiability + estimatedShares > GLOBAL_LIABILITY_CAP) {
                return {
                    allowed: false,
                    reason: `Global liability cap exceeded. Current: $${globalLiability.toFixed(2)}, Cap: $${GLOBAL_LIABILITY_CAP}`
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Calculates the maximum potential payout for a specific event.
     * Max Payout = Max(Shares held by users for Outcome A, Shares held by users for Outcome B, ...)
     */
    static async calculateEventLiability(eventId: string): Promise<number> {
        // Get all balances for this event, excluding AMM Bot
        const balances = await prisma.balance.findMany({
            where: {
                eventId: eventId,
                userId: { not: AMM_BOT_USER_ID },
                tokenSymbol: { not: 'TUSD' } // Only outcome tokens
            }
        });

        // Group by outcome (tokenSymbol)
        const sharesByOutcome: Record<string, number> = {};

        for (const bal of balances) {
            const symbol = bal.tokenSymbol;
            sharesByOutcome[symbol] = (sharesByOutcome[symbol] || 0) + bal.amount;
        }

        // Find the max payout
        let maxPayout = 0;
        for (const symbol in sharesByOutcome) {
            if (sharesByOutcome[symbol] > maxPayout) {
                maxPayout = sharesByOutcome[symbol];
            }
        }

        return maxPayout;
    }

    /**
     * Calculates the total liability across all events.
     */
    static async calculateGlobalLiability(): Promise<number> {
        // We can iterate over all active events and sum their liabilities
        // This might be expensive if there are many events, but for now it's safe.
        const events = await prisma.event.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true }
        });

        let totalLiability = 0;
        for (const event of events) {
            totalLiability += await this.calculateEventLiability(event.id);
        }

        return totalLiability;
    }
}
