// Server-side AMM utilities that require database access
// These functions should only be used in API routes and server-side code

import { prisma } from './prisma';
import { calculateTokensForCost, calculateMultipleLMSRProbabilities } from './amm';

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

    // Determine requested duration
    const now = new Date();
    let durationMs = 0;

    if (period === '6h') {
        durationMs = 6 * 60 * 60 * 1000;
    } else if (period === '1d') {
        durationMs = 24 * 60 * 60 * 1000;
    } else if (period === '1w') {
        durationMs = 7 * 24 * 60 * 60 * 1000;
    } else if (period === '1m') {
        durationMs = 30 * 24 * 60 * 60 * 1000;
    } else if (period === '3m') {
        durationMs = 90 * 24 * 60 * 60 * 1000;
    } else {
        // 'all' or unmatched - use full history
        durationMs = now.getTime() - event.createdAt.getTime();
    }

    // Ensure we don't go before event creation
    const eventAgeMs = now.getTime() - event.createdAt.getTime();
    const effectiveDuration = Math.min(durationMs, eventAgeMs);

    // Set bucket size to get approx 200 points for the VIEW range
    // but not smaller than 1 minute to avoid excessive processing
    // IMPORTANT: Use effectiveDuration to ensure we get enough points even if the event is young
    // e.g. viewing '1m' for a 1-day old event should still give 200 points for that day
    const targetPoints = 200;
    let bucketSizeMs = Math.max(Math.floor(effectiveDuration / targetPoints), 60 * 1000);

    // Determines where the chart data STARTS
    // For specific periods (e.g. 1d), we want the chart to start 24h ago
    // even if the event is older. 
    // If event is younger than period, start at creation.
    let startTime = new Date(now.getTime() - durationMs);
    if (startTime.getTime() < event.createdAt.getTime()) {
        startTime = new Date(event.createdAt);
    }

    // Fetch ALL market activities to replay AMM state correctly
    // We MUST replay from the beginning to get correct qYes/qNo values
    const allActivities = await (prisma as any).marketActivity.findMany({
        where: {
            eventId,
            type: { in: ['BET', 'TRADE'] }
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
        const normalizedOption = activity.option.toUpperCase() as 'YES' | 'NO';
        const tokens = calculateTokensForCost(qYes, qNo, activity.amount, normalizedOption, b);

        if (normalizedOption === 'YES') qYes += tokens;
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

    // Align start time to bucket boundary for clean charts
    let currentBucketStart = Math.floor(startTime.getTime() / bucketSizeMs) * bucketSizeMs;
    let currentBucketEnd = currentBucketStart + bucketSizeMs;

    // Find the initial state (last state before currentBucketStart)
    let initialQYes = 0;
    let initialQNo = 0;
    let initialYesPrice = 0.5;

    for (const state of stateHistory) {
        if (state.time.getTime() < currentBucketStart) {
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
        let hasActivity = false;

        // Find all states in this bucket
        for (const state of stateHistory) {
            const stateTime = state.time.getTime();
            if (stateTime >= currentBucketStart && stateTime < currentBucketEnd) {
                bucketVolume += state.volume;
                lastStateInBucket = state;
                hasActivity = true;
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

    // ALWAYS add current state from DB as the final point
    // This ensures the chart ends at the same values as the legend/trading panel
    const currentQYes = event.qYes || 0;
    const currentQNo = event.qNo || 0;
    const currentDiff = (currentQNo - currentQYes) / b;
    const currentYesPrice = 1 / (1 + Math.exp(currentDiff));

    const currentTimestamp = Math.floor(now.getTime() / 1000);
    const lastBucketTimestamp = buckets.length > 0 ? buckets[buckets.length - 1].timestamp : 0;

    // Only add if it's later than the last bucket
    if (currentTimestamp > lastBucketTimestamp) {
        buckets.push({
            timestamp: currentTimestamp,
            yesPrice: currentYesPrice,
            volume: 0
        });
    } else if (buckets.length > 0) {
        // Update the last bucket to have the current probability
        buckets[buckets.length - 1].yesPrice = currentYesPrice;
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
    // Determine requested duration
    let durationMs = 0;

    if (period === '6h') {
        durationMs = 6 * 60 * 60 * 1000;
    } else if (period === '1d') {
        durationMs = 24 * 60 * 60 * 1000;
    } else if (period === '1w') {
        durationMs = 7 * 24 * 60 * 60 * 1000;
    } else if (period === '1m') {
        durationMs = 30 * 24 * 60 * 60 * 1000;
    } else if (period === '3m') {
        durationMs = 90 * 24 * 60 * 60 * 1000;
    } else {
        // 'all' or unmatched - use full history
        durationMs = now.getTime() - event.createdAt.getTime();
    }

    // Ensure we don't go before event creation
    const eventAgeMs = now.getTime() - event.createdAt.getTime();
    const effectiveDuration = Math.min(durationMs, eventAgeMs);

    const targetPoints = 200;
    // Use effectiveDuration for bucket size to ensure enough points (200) even for young events
    let bucketSizeMs = Math.max(Math.floor(effectiveDuration / targetPoints), 60 * 1000);

    // Determine start time
    let startTime = new Date(now.getTime() - durationMs);
    if (startTime.getTime() < event.createdAt.getTime()) {
        startTime = new Date(event.createdAt);
    }

    // Fetch all market activities for this event
    const allActivities = await (prisma as any).marketActivity.findMany({
        where: {
            eventId,
            type: { in: ['BET', 'TRADE'] }
        },
        orderBy: { createdAt: 'asc' }
    });

    // Initialize liquidity state for all outcomes
    const outcomeLiquidities = new Map<string, number>();
    // Sort outcomes to ensure deterministic order
    const sortedOutcomes = [...(event as any).outcomes].sort((a: any, b: any) => a.id.localeCompare(b.id));

    sortedOutcomes.forEach((outcome: any) => {
        outcomeLiquidities.set(outcome.id, 0); // Start at 0 and replay history
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
        // For multiple outcomes, we need to update liquidity for any activity with an outcomeId
        // Previously this only checked isAmmInteraction, but seeded data has that as false
        // The activity.amount is the shares bought, and activity.outcomeId is the target
        if (activity.outcomeId) {
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

    let currentBucketStart = Math.floor(startTime.getTime() / bucketSizeMs) * bucketSizeMs;
    let currentBucketEnd = currentBucketStart + bucketSizeMs;

    // Initial state calculation for start time
    // We need to replay history up to currentBucketStart to find correct initial probabilities

    // Start with default/initial probabilities (1/N)
    // CRITICAL FIX: Do NOT use outcome.probability from DB as it is the CURRENT probability
    // We strictly use 1/N because the AMM replay starts with 0 liquidity (equal probs)
    let initialProbabilities = new Map<string, number>();
    event.outcomes.forEach((outcome: any) => {
        initialProbabilities.set(outcome.id, 1 / event.outcomes.length);
    });

    // Advance to currentBucketStart
    for (const state of stateHistory) {
        if (state.time.getTime() < currentBucketStart) {
            initialProbabilities = state.probabilities;
        } else {
            break;
        }
    }

    // Get first outcome ID for yesPrice
    const firstOutcomeId = (event as any).outcomes[0].id;

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
            yesPrice: probabilities.get(firstOutcomeId) || (1 / (event as any).outcomes.length), // Use first outcome probability
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
                yesPrice: lastState.probabilities.get(firstOutcomeId) || (1 / (event as any).outcomes.length),
                volume: lastState.volume,
                outcomes
            });
        }
    }

    // Note: We intentionally do NOT add an artificial "current state" point
    // because the stored probabilities may not match the replayed history,
    // which would create a discontinuous spike in the chart.

    // Ensure data is sorted
    buckets.sort((a, b) => a.timestamp - b.timestamp);

    return buckets;
}