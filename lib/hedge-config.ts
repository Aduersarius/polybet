/**
 * Simple Hedge Configuration
 * 
 * KISS principle - all config in one place, no DB lookups
 */

export const HEDGE_CONFIG = {
    // Feature control
    enabled: true,
    allowUnhedged: false, // If true, allows trades without hedge when PM fails

    // Polymarket constraints
    minOrderSize: 5, // Polymarket requires minimum 5 shares
    timeout: 5000, // 5 seconds max for Polymarket operations
    priceStaleThreshold: 5000, // 5 seconds - reject orderbook if older

    // Economics
    defaultSpread: 0.04, // 4% markup (covers 2.5% fees + 1.5% profit)
    maxSlippage: 0.02, // 2% max price movement tolerance
    minProfit: 0.01, // $0.01 minimum profit per trade

    // Reliability
    retryAttempts: 1, // Max retries for transient failures
    circuitBreakerThreshold: 5, // Open circuit after N consecutive failures
    circuitBreakerTimeout: 30000, // 30s circuit breaker cooldown
} as const;

/**
 * Get current configuration
 * Future: Could load from DB/Redis for dynamic updates
 */
export function getHedgeConfig() {
    return { ...HEDGE_CONFIG };
}

/**
 * Validate order meets minimum requirements
 */
export function validateOrderSize(amount: number): { valid: boolean; error?: string } {
    if (amount < HEDGE_CONFIG.minOrderSize) {
        return {
            valid: false,
            error: `Order size $${amount} below minimum $${HEDGE_CONFIG.minOrderSize}`,
        };
    }
    return { valid: true };
}

/**
 * Calculate user price from Polymarket price + spread
 */
export function calculateUserPrice(polymarketPrice: number, spread: number = HEDGE_CONFIG.defaultSpread): number {
    return Math.min(0.99, Math.max(0.01, polymarketPrice * (1 + spread)));
}

/**
 * Calculate expected profit
 */
export function calculateProfit(params: {
    amount: number;
    polymarketPrice: number;
    userPrice: number;
}): {
    spread: number;
    fees: number;
    netProfit: number;
} {
    const { amount, polymarketPrice, userPrice } = params;

    const spreadValue = (userPrice - polymarketPrice) * amount;

    // Polymarket fees: ~2.5% (2% maker + 0.5% taker average)
    const fees = amount * polymarketPrice * 0.025;

    const netProfit = spreadValue - fees;

    return {
        spread: spreadValue,
        fees,
        netProfit,
    };
}
