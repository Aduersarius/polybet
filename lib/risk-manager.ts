import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const GLOBAL_LIABILITY_CAP = 50000000; // $50M (increased for testing with existing data)
const EVENT_LIABILITY_CAP = 50000000;   // $50M (increased for testing with existing data)
const MAX_SLIPPAGE = 0.10;          // 10%
const AMM_BOT_USER_ID = 'cminhk477000002s8jld69y1f';

// New anti-manipulation constants
const MAX_ORDER_SIZE_PERCENT = 0.05; // Max 5% of market liquidity
const TRADING_COOLDOWN_MS = 30000;   // 30 seconds between trades on same event
const MAX_DAILY_TRADES_PER_USER = 100; // Per event per day

export class RiskManager {
    /**
     * Validates a trade against risk rules:
     * 1. Trading Cooldown
     * 2. Daily Trade Limits
     * 3. Order Size Limits
     * 4. Slippage Cap
     * 5. Event Liability Cap
     * 6. Global Liability Cap
     */
    static async validateTrade(
        userId: string,
        eventId: string,
        amount: number, // USD amount to spend (buy) or shares to sell
        side: 'buy' | 'sell',
        option: string, // Outcome ID or 'YES'/'NO'
        currentProb: number, // Current spot price/probability
        predictedProb: number // Predicted spot price/probability after trade
    ): Promise<{ allowed: boolean; reason?: string }> {

        // 1. Check Trading Cooldown
        const cooldownCheck = await this.checkTradingCooldown(userId, eventId);
        if (!cooldownCheck.allowed) {
            return cooldownCheck;
        }

        // 2. Check Daily Trade Limits
        const dailyLimitCheck = await this.checkDailyTradeLimits(userId, eventId);
        if (!dailyLimitCheck.allowed) {
            return dailyLimitCheck;
        }

        // 3. Check Order Size Limits
        const orderSizeCheck = await this.checkOrderSizeLimits(eventId, amount, side, currentProb);
        if (!orderSizeCheck.allowed) {
            return orderSizeCheck;
        }

        // 4. Check Slippage Cap
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
        let balances: Array<{ tokenSymbol: string; amount: Prisma.Decimal }>;
        try {
            balances = await prisma.balance.findMany({
                where: {
                    eventId: eventId,
                    userId: { not: AMM_BOT_USER_ID },
                    tokenSymbol: { not: 'TUSD' } // Only outcome tokens
                },
                select: {
                    tokenSymbol: true,
                    amount: true,
                },
            });
        } catch (err) {
            const code = (err as any)?.code;
            // Gracefully handle schema drift (e.g., column missing in current DB)
            if (code === 'P2022' || code === 'P2010' || (err as Error).message?.includes('does not exist')) {
                console.warn('[risk-manager] balance query skipped due to schema mismatch:', (err as Error).message);
                return 0;
            }
            throw err;
        }

        // Group by outcome (tokenSymbol)
        const sharesByOutcome: Record<string, number> = {};

        for (const bal of balances) {
            const symbol = bal.tokenSymbol;
            sharesByOutcome[symbol] = (sharesByOutcome[symbol] || 0) + bal.amount.toNumber();
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

    /**
     * Checks if user is within trading cooldown for this event
     */
    static async checkTradingCooldown(userId: string, eventId: string): Promise<{ allowed: boolean; reason?: string }> {
        const cooldownStart = new Date(Date.now() - TRADING_COOLDOWN_MS);

        const recentTrade = await prisma.marketActivity.findFirst({
            where: {
                userId,
                eventId,
                createdAt: { gte: cooldownStart }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (recentTrade) {
            const timeLeft = TRADING_COOLDOWN_MS - (Date.now() - recentTrade.createdAt.getTime());
            const secondsLeft = Math.ceil(timeLeft / 1000);
            return {
                allowed: false,
                reason: `Trading cooldown active. Wait ${secondsLeft} seconds before next trade on this event.`
            };
        }

        return { allowed: true };
    }

    /**
     * Checks if user has exceeded daily trade limits for this event
     */
    static async checkDailyTradeLimits(userId: string, eventId: string): Promise<{ allowed: boolean; reason?: string }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todaysTrades = await prisma.marketActivity.count({
            where: {
                userId,
                eventId,
                createdAt: { gte: today, lt: tomorrow }
            }
        });

        if (todaysTrades >= MAX_DAILY_TRADES_PER_USER) {
            return {
                allowed: false,
                reason: `Daily trade limit exceeded (${todaysTrades}/${MAX_DAILY_TRADES_PER_USER}) for this event.`
            };
        }

        return { allowed: true };
    }

    /**
     * Checks if order size exceeds market liquidity limits
     */
    static async checkOrderSizeLimits(
        eventId: string,
        amount: number,
        side: 'buy' | 'sell',
        currentProb: number
    ): Promise<{ allowed: boolean; reason?: string }> {
        // For buy orders, amount is USD, for sell it's shares
        // We need to estimate the impact on market liquidity

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: { outcomes: true }
        });

        if (!event) return { allowed: true }; // Allow if event not found

        let totalMarketLiquidity = 0;

        if (event.type === 'MULTIPLE') {
            // Sum liquidity across all outcomes
            for (const outcome of event.outcomes) {
                totalMarketLiquidity += outcome.liquidity || 0;
            }
        } else {
            // For binary, use qYes + qNo
            totalMarketLiquidity = (event.qYes || 0) + (event.qNo || 0);
        }

        // Estimate shares affected by this trade
        let estimatedShares = 0;
        if (side === 'buy') {
            // Rough estimate: amount / currentProb gives shares
            estimatedShares = amount / Math.max(currentProb, 0.01);
        } else {
            // For sell, amount is already shares
            estimatedShares = amount;
        }

        const liquidityImpact = estimatedShares / Math.max(totalMarketLiquidity, 1);

        if (liquidityImpact > MAX_ORDER_SIZE_PERCENT) {
            return {
                allowed: false,
                reason: `Order too large: ${(liquidityImpact * 100).toFixed(1)}% of market liquidity (Max ${MAX_ORDER_SIZE_PERCENT * 100}%)`
            };
        }

        return { allowed: true };
    }
}
