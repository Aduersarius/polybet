// Automated Market Maker (AMM) utilities for prediction markets
// Using Logarithmic Market Scoring Rule (LMSR)

export interface OddsData {
    yesPrice: number;  // Probability of YES (0-1)
    noPrice: number;   // Probability of NO (0-1)
    yesOdds: number;   // Decimal odds for YES (1.1+)
    noOdds: number;    // Decimal odds for NO (1.1+)
}

/**
 * Calculate current odds using LMSR formula for binary events
 * @param qYes - Cumulative YES tokens bought
 * @param qNo - Cumulative NO tokens bought
 * @param b - Liquidity parameter (higher = more liquidity)
 * @returns Current odds data
 */
export function calculateLMSROdds(qYes: number, qNo: number, b: number): OddsData {
    // Stable LMSR formula: price = 1 / (1 + e^((q_no - q_yes) / b))
    const diff = (qNo - qYes) / b;
    const yesPrice = 1 / (1 + Math.exp(diff));
    const noPrice = 1 - yesPrice;

    // Decimal odds = 1 / price
    const yesOdds = 1 / yesPrice;
    const noOdds = 1 / noPrice;

    return {
        yesPrice,
        noPrice,
        yesOdds,
        noOdds,
    };
}

/**
 * Calculate probabilities for multiple outcomes using LMSR
 * @param outcomeLiquidities - Map of outcome IDs to their liquidity values
 * @param b - Liquidity parameter
 * @returns Map of outcome IDs to their probabilities
 */
export function calculateMultipleLMSRProbabilities(
    outcomeLiquidities: Map<string, number>,
    b: number
): Map<string, number> {
    const outcomeIds = Array.from(outcomeLiquidities.keys());
    const probabilities = new Map<string, number>();

    if (outcomeIds.length === 0) return probabilities;

    // Calculate denominator: sum of exp(q_i / b) for all outcomes
    let denominator = 0;
    for (const outcomeId of outcomeIds) {
        const q = outcomeLiquidities.get(outcomeId) || 0;
        denominator += Math.exp(q / b);
    }

    // Calculate probability for each outcome: exp(q_i / b) / denominator
    for (const outcomeId of outcomeIds) {
        const q = outcomeLiquidities.get(outcomeId) || 0;
        const probability = Math.exp(q / b) / denominator;
        probabilities.set(outcomeId, probability);
    }

    return probabilities;
}

/**
 * Calculate cost to buy tokens for multiple outcomes using LMSR
 * @param outcomeLiquidities - Current liquidity values for all outcomes
 * @param buyAmounts - Map of outcome IDs to amounts to buy
 * @param b - Liquidity parameter
 * @returns Cost in base currency
 */
export function calculateMultipleLMSRCost(
    outcomeLiquidities: Map<string, number>,
    buyAmounts: Map<string, number>,
    b: number
): number {
    // Current cost: b * ln(sum(exp(q_i / b)))
    let currentSum = 0;
    for (const [outcomeId, q] of outcomeLiquidities) {
        currentSum += Math.exp(q / b);
    }
    const currentCost = b * Math.log(currentSum);

    // New cost after buying
    let newSum = 0;
    for (const [outcomeId, q] of outcomeLiquidities) {
        const buyAmount = buyAmounts.get(outcomeId) || 0;
        newSum += Math.exp((q + buyAmount) / b);
    }
    const newCost = b * Math.log(newSum);

    return newCost - currentCost;
}

/**
 * Calculate tokens received for a given cost in multiple outcome LMSR
 * @param outcomeLiquidities - Current liquidity values for all outcomes
 * @param cost - Amount to spend
 * @param outcomeId - Which outcome to buy
 * @param b - Liquidity parameter
 * @returns Amount of tokens received
 */
export function calculateMultipleTokensForCost(
    outcomeLiquidities: Map<string, number>,
    cost: number,
    outcomeId: string,
    b: number
): number {
    // Binary search to find the amount of tokens that costs exactly 'cost'
    let low = 0;
    let high = cost * 10; // Upper bound
    let precision = 0.001;

    while (high - low > precision) {
        const mid = (low + high) / 2;

        // Create buy amounts map with only the target outcome
        const buyAmounts = new Map<string, number>();
        buyAmounts.set(outcomeId, mid);

        const calculatedCost = calculateMultipleLMSRCost(outcomeLiquidities, buyAmounts, b);

        if (calculatedCost < cost) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

/**
 * Calculate cost to buy tokens using LMSR
 * @param currentQYes - Current cumulative YES tokens
 * @param currentQNo - Current cumulative NO tokens
 * @param buyQYes - Amount of YES tokens to buy
 * @param buyQNo - Amount of NO tokens to buy
 * @param b - Liquidity parameter
 * @returns Cost in base currency
 */
export function calculateLMSRCost(
    currentQYes: number,
    currentQNo: number,
    buyQYes: number,
    buyQNo: number,
    b: number
): number {
    const currentCost = b * Math.log(Math.exp(currentQYes / b) + Math.exp(currentQNo / b));
    const newCost = b * Math.log(
        Math.exp((currentQYes + buyQYes) / b) + Math.exp((currentQNo + buyQNo) / b)
    );
    return newCost - currentCost;
}

/**
 * Calculate tokens received for a given cost
 * @param currentQYes - Current cumulative YES tokens
 * @param currentQNo - Current cumulative NO tokens
 * @param cost - Amount to spend
 * @param outcome - 'YES' or 'NO'
 * @param b - Liquidity parameter
 * @returns Amount of tokens received
 */
export function calculateTokensForCost(
    currentQYes: number,
    currentQNo: number,
    cost: number,
    outcome: 'YES' | 'NO',
    b: number
): number {
    // Binary search to find the amount of tokens that costs exactly 'cost'
    let low = 0;
    let high = cost * 10; // Upper bound
    let precision = 0.001;

    while (high - low > precision) {
        const mid = (low + high) / 2;
        const buyQYes = outcome === 'YES' ? mid : 0;
        const buyQNo = outcome === 'NO' ? mid : 0;

        const calculatedCost = calculateLMSRCost(currentQYes, currentQNo, buyQYes, buyQNo, b);

        if (calculatedCost < cost) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

/**
 * Generate historical odds data points
 * @param eventId - Event ID
 * @param period - Time period ('1h', '24h', '7d', '30d')
 * @returns Array of historical odds data points
 */

