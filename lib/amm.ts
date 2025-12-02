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
import { prisma } from '@/lib/prisma';

/**
 * Generate historical odds data points based on real bets
 * @param eventId - Event ID
 * @param period - Time period ('1h', '24h', '7d', '30d', 'all')
 * @returns Array of historical odds data points
 */
export async function generateHistoricalOdds(
    eventId: string,
    period: string
): Promise<Array<{ timestamp: number; yesPrice: number; volume: number }>> {
    // Check if this is a multiple outcome event
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { type: true }
    }) as any;

    if (event?.type === 'MULTIPLE') {
        return generateMultipleHistoricalOdds(eventId, period);
    }

    // Original binary logic
    return generateBinaryHistoricalOdds(eventId, period);
}

/**
 * Generate historical odds for binary events
 */
async function generateBinaryHistoricalOdds(
    eventId: string,
    period: string
): Promise<Array<{ timestamp: number; yesPrice: number; volume: number }>> {
    // Fetch event to get creation time and liquidity param
    const event = (await prisma.event.findUnique({
        where: { id: eventId }
    })) as any;

    if (!event) return [];

    // All periods show FULL history from event creation to now
    // Period only controls the granularity (bucket size)
    const now = new Date();
    const startTime = new Date(event.createdAt);
    let bucketSizeMs = 0; // in milliseconds

    // Determine bucket size based on period
    if (period === '5m') {
        bucketSizeMs = 5 * 60 * 1000; // 5 minutes per bucket
    } else if (period === '1h') {
        bucketSizeMs = 60 * 60 * 1000; // 1 hour per bucket
    } else if (period === '6h') {
        bucketSizeMs = 6 * 60 * 60 * 1000; // 6 hours per bucket
    } else if (period === '1d' || period === '24h') {
        bucketSizeMs = 24 * 60 * 60 * 1000; // 1 day per bucket
    } else if (period === '1w' || period === '7d') {
        bucketSizeMs = 7 * 24 * 60 * 60 * 1000; // 1 week per bucket
    } else if (period === '1m' || period === '30d') {
        bucketSizeMs = 30 * 24 * 60 * 60 * 1000; // 1 month per bucket
    } else {
        // 'all' - adaptive bucket size for ~100 points
        const totalTimeMs = now.getTime() - event.createdAt.getTime();
        bucketSizeMs = Math.max(totalTimeMs / 100, 60 * 1000); // At least 1 minute buckets
    }

    // Fetch ALL market activities to replay AMM state correctly
    const allActivities = await (prisma as any).marketActivity.findMany({
        where: {
            eventId,
            type: 'BET',
            createdAt: { gte: event.createdAt }
        },
        orderBy: { createdAt: 'asc' }
    });

    // Replay AMM state through all activities
    let qYes = 0;
    let qNo = 0;
    const b = event.liquidityParameter || 10000.0;

    // Track state at each activity
    const stateHistory: Array<{ time: Date; qYes: number; qNo: number; yesPrice: number; volume: number }> = [];

    for (const activity of allActivities) {
        const tokens = calculateTokensForCost(qYes, qNo, activity.amount, activity.option as 'YES' | 'NO', b);

        if (activity.option === 'YES') qYes += tokens;
        else qNo += tokens;

        const diff = (qNo - qYes) / b;
        const yesPrice = 1 / (1 + Math.exp(diff));

        stateHistory.push({
            time: activity.createdAt,
            qYes,
            qNo,
            yesPrice,
            volume: activity.amount
        });
    }

    // Now aggregate into time buckets
    const buckets: Array<{ timestamp: number; yesPrice: number; volume: number }> = [];

    // Round the start time to the nearest period boundary
    let currentBucketStart = startTime.getTime();

    // Align to period boundaries
    if (period === '5m') {
        // Round down to nearest 5 minutes
        const date = new Date(currentBucketStart);
        date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0);
        currentBucketStart = date.getTime();
    } else if (period === '1h') {
        // Round down to nearest hour
        const date = new Date(currentBucketStart);
        date.setMinutes(0, 0, 0);
        currentBucketStart = date.getTime();
    } else if (period === '6h') {
        // Round down to nearest 6 hours (0, 6, 12, 18)
        const date = new Date(currentBucketStart);
        date.setHours(Math.floor(date.getHours() / 6) * 6, 0, 0, 0);
        currentBucketStart = date.getTime();
    } else if (period === '1d' || period === '24h') {
        // Round down to start of day (midnight)
        const date = new Date(currentBucketStart);
        date.setHours(0, 0, 0, 0);
        currentBucketStart = date.getTime();
    }

    let currentBucketEnd = currentBucketStart + bucketSizeMs;

    // Find the initial state (last state before startTime)
    let initialQYes = 0;
    let initialQNo = 0;
    let initialYesPrice = 0.5;

    for (const state of stateHistory) {
        if (state.time.getTime() < startTime.getTime()) {
            initialQYes = state.qYes;
            initialQNo = state.qNo;
            initialYesPrice = state.yesPrice;
        } else {
            break;
        }
    }

    // Create buckets
    while (currentBucketStart <= now.getTime()) {
        let bucketVolume = 0;
        let lastStateInBucket: typeof stateHistory[0] | null = null;

        // Find all states in this bucket
        for (const state of stateHistory) {
            const stateTime = state.time.getTime();
            if (stateTime >= currentBucketStart && stateTime < currentBucketEnd) {
                bucketVolume += state.volume;
                lastStateInBucket = state;
            }
        }

        // Use last state in bucket, or carry forward previous state
        const yesPrice = lastStateInBucket ? lastStateInBucket.yesPrice : initialYesPrice;

        // Round timestamp to the bucket start (removes seconds/milliseconds)
        const roundedTimestamp = Math.floor(currentBucketStart / 1000);

        buckets.push({
            timestamp: roundedTimestamp,
            yesPrice,
            volume: bucketVolume
        });

        // Update initial price for next bucket
        if (lastStateInBucket) {
            initialYesPrice = lastStateInBucket.yesPrice;
        }

        currentBucketStart = currentBucketEnd;
        currentBucketEnd = currentBucketStart + bucketSizeMs;
    }

    // Always include the very latest state as the last point
    if (stateHistory.length > 0) {
        const lastState = stateHistory[stateHistory.length - 1];
        const lastTimestamp = Math.floor(lastState.time.getTime() / 1000);
        const lastBucketTimestamp = buckets.length > 0 ? buckets[buckets.length - 1].timestamp : 0;

        // Only add if it's actually later than the last bucket
        if (lastTimestamp > lastBucketTimestamp) {
            buckets.push({
                timestamp: lastTimestamp,
                yesPrice: lastState.yesPrice,
                volume: lastState.volume
            });
        }
    }

    // Ensure data is sorted by timestamp (ascending)
    buckets.sort((a, b) => a.timestamp - b.timestamp);

    return buckets;
}

/**
 * Generate historical odds for multiple outcome events
 * @param eventId - Event ID
 * @param period - Time period
 * @returns Array of historical data points with outcome probabilities over time
 */
async function generateMultipleHistoricalOdds(
    eventId: string,
    period: string
): Promise<Array<{ timestamp: number; yesPrice: number; volume: number; outcomes?: Array<{ id: string; name: string; probability: number; color?: string }> }>> {
    // Fetch event and outcomes
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    }) as any;

    if (!event || event.type !== 'MULTIPLE') return [];

    const now = new Date();
    const startTime = new Date(event.createdAt);
    let bucketSizeMs = 0;

    // Determine bucket size based on period (same logic as binary)
    if (period === '5m') {
        bucketSizeMs = 5 * 60 * 1000;
    } else if (period === '1h') {
        bucketSizeMs = 60 * 60 * 1000;
    } else if (period === '6h') {
        bucketSizeMs = 6 * 60 * 60 * 1000;
    } else if (period === '1d' || period === '24h') {
        bucketSizeMs = 24 * 60 * 60 * 1000;
    } else if (period === '1w' || period === '7d') {
        bucketSizeMs = 7 * 24 * 60 * 60 * 1000;
    } else if (period === '1m' || period === '30d') {
        bucketSizeMs = 30 * 24 * 60 * 60 * 1000;
    } else {
        // 'all' - adaptive bucket size
        const totalTimeMs = now.getTime() - event.createdAt.getTime();
        bucketSizeMs = Math.max(totalTimeMs / 100, 60 * 1000);
    }

    // Fetch all market activities for this event
    const allActivities = await (prisma as any).marketActivity.findMany({
        where: {
            eventId,
            type: 'TRADE',
            createdAt: { gte: event.createdAt }
        },
        orderBy: { createdAt: 'asc' }
    });

    // Initialize liquidity state for all outcomes
    const outcomeLiquidities = new Map<string, number>();
    (event as any).outcomes.forEach((outcome: any) => {
        outcomeLiquidities.set(outcome.id, outcome.liquidity || 0);
    });

    const b = event.liquidityParameter || 10000.0;

    // Track state at each activity
    const stateHistory: Array<{
        time: Date;
        liquidities: Map<string, number>;
        probabilities: Map<string, number>;
        volume: number;
    }> = [];

    // Replay activities
    for (const activity of allActivities) {
        // For AMM trades on multiple outcomes, we need to update liquidity
        // The activity.amount is the shares bought, and activity.outcomeId is the target
        if (activity.outcomeId && activity.isAmmInteraction) {
            const currentLiq = outcomeLiquidities.get(activity.outcomeId) || 0;
            outcomeLiquidities.set(activity.outcomeId, currentLiq + activity.amount);
        }

        // Calculate probabilities using LMSR
        const probabilities = calculateMultipleLMSRProbabilities(outcomeLiquidities, b);

        // Store state snapshot
        stateHistory.push({
            time: activity.createdAt,
            liquidities: new Map(outcomeLiquidities),
            probabilities: new Map(probabilities),
            volume: activity.amount * (activity.price || 1) // Cost of the trade
        });
    }

    // Now aggregate into time buckets
    const buckets: Array<{
        timestamp: number;
        yesPrice: number;
        volume: number;
        outcomes?: Array<{ id: string; name: string; probability: number; color?: string }>
    }> = [];

    let currentBucketStart = startTime.getTime();

    // Align to period boundaries (same as binary)
    if (period === '5m') {
        const date = new Date(currentBucketStart);
        date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0);
        currentBucketStart = date.getTime();
    } else if (period === '1h') {
        const date = new Date(currentBucketStart);
        date.setMinutes(0, 0, 0);
        currentBucketStart = date.getTime();
    } else if (period === '6h') {
        const date = new Date(currentBucketStart);
        date.setHours(Math.floor(date.getHours() / 6) * 6, 0, 0, 0);
        currentBucketStart = date.getTime();
    } else if (period === '1d' || period === '24h') {
        const date = new Date(currentBucketStart);
        date.setHours(0, 0, 0, 0);
        currentBucketStart = date.getTime();
    }

    let currentBucketEnd = currentBucketStart + bucketSizeMs;

    // Initial state (equal probabilities)
    let initialProbabilities = new Map<string, number>();
    event.outcomes.forEach((outcome: any) => {
        initialProbabilities.set(outcome.id, 1 / event.outcomes.length);
    });

    // Create buckets
    while (currentBucketStart <= now.getTime()) {
        let bucketVolume = 0;
        let lastStateInBucket: typeof stateHistory[0] | null = null;

        // Find all states in this bucket
        for (const state of stateHistory) {
            const stateTime = state.time.getTime();
            if (stateTime >= currentBucketStart && stateTime < currentBucketEnd) {
                bucketVolume += state.volume;
                lastStateInBucket = state;
            }
        }

        // Use last state in bucket, or carry forward previous state
        const probabilities = lastStateInBucket ? lastStateInBucket.probabilities : initialProbabilities;

        // Convert probabilities to outcome array
        const outcomes = (event as any).outcomes.map((outcome: any) => ({
            id: outcome.id,
            name: outcome.name,
            probability: probabilities.get(outcome.id) || (1 / (event as any).outcomes.length),
            color: outcome.color || undefined
        }));

        const roundedTimestamp = Math.floor(currentBucketStart / 1000);

        buckets.push({
            timestamp: roundedTimestamp,
            yesPrice: 0.5, // Not used for multiple outcomes
            volume: bucketVolume,
            outcomes
        });

        // Update initial probabilities for next bucket
        if (lastStateInBucket) {
            initialProbabilities = lastStateInBucket.probabilities;
        }

        currentBucketStart = currentBucketEnd;
        currentBucketEnd = currentBucketStart + bucketSizeMs;
    }

    // Always include the very latest state
    if (stateHistory.length > 0) {
        const lastState = stateHistory[stateHistory.length - 1];
        const lastTimestamp = Math.floor(lastState.time.getTime() / 1000);
        const lastBucketTimestamp = buckets.length > 0 ? buckets[buckets.length - 1].timestamp : 0;

        if (lastTimestamp > lastBucketTimestamp) {
            const outcomes = (event as any).outcomes.map((outcome: any) => ({
                id: outcome.id,
                name: outcome.name,
                probability: lastState.probabilities.get(outcome.id) || (1 / (event as any).outcomes.length),
                color: outcome.color || undefined
            }));

            buckets.push({
                timestamp: lastTimestamp,
                yesPrice: 0.5,
                volume: lastState.volume,
                outcomes
            });
        }
    }

    // If no trades yet, return current state
    if (buckets.length === 0) {
        const currentOutcomes = (event as any).outcomes.map((outcome: any) => ({
            id: outcome.id,
            name: outcome.name,
            probability: outcome.probability || (1 / (event as any).outcomes.length),
            color: outcome.color || undefined
        }));

        buckets.push({
            timestamp: Math.floor(now.getTime() / 1000),
            yesPrice: 0.5,
            volume: 0,
            outcomes: currentOutcomes
        });
    }

    // Ensure data is sorted
    buckets.sort((a, b) => a.timestamp - b.timestamp);

    return buckets;
}