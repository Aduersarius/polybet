// Automated Market Maker (AMM) utilities for prediction markets
// Using Logarithmic Market Scoring Rule (LMSR)

export interface OddsData {
    yesPrice: number;  // Probability of YES (0-1)
    noPrice: number;   // Probability of NO (0-1)
    yesOdds: number;   // Decimal odds for YES (1.1+)
    noOdds: number;    // Decimal odds for NO (1.1+)
}

/**
 * Calculate current odds using LMSR formula
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
    // Fetch event to get creation time and liquidity param
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { createdAt: true, liquidityParameter: true }
    });

    if (!event) return [];

    // Determine start time based on period
    const now = new Date();
    let startTime = new Date(event.createdAt);

    if (period === '1h') startTime = new Date(now.getTime() - 60 * 60 * 1000);
    else if (period === '24h') startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else if (period === '7d') startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === '30d') startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Ensure start time is not before event creation
    if (startTime < event.createdAt) startTime = event.createdAt;

    // Fetch bets
    const bets = await prisma.bet.findMany({
        where: {
            eventId,
            createdAt: { gte: event.createdAt } // Get all bets to replay state correctly
        },
        orderBy: { createdAt: 'asc' }
    });

    const data: Array<{ timestamp: number; yesPrice: number; volume: number }> = [];

    // Replay state
    let qYes = 0;
    let qNo = 0;
    const b = event.liquidityParameter || 25000.0; // Default to new standard

    // Initial point
    data.push({
        timestamp: Math.floor(event.createdAt.getTime() / 1000),
        yesPrice: 0.5,
        volume: 0
    });

    // Process bets
    for (const bet of bets) {
        // Update AMM state
        // Calculate tokens bought (simplified reverse calculation or just assume 1:1 for volume tracking? 
        // No, we need accurate price impact. 
        // We need to know how many tokens were bought. 
        // Since we don't store tokens bought in Bet model (only amount in $), 
        // we have to re-calculate tokensForCost.

        const tokens = calculateTokensForCost(qYes, qNo, bet.amount, bet.option as 'YES' | 'NO', b);

        if (bet.option === 'YES') qYes += tokens;
        else qNo += tokens;

        // Calculate new price
        const diff = (qNo - qYes) / b;
        const yesPrice = 1 / (1 + Math.exp(diff));

        // Only add data point if it's within the requested period
        if (bet.createdAt >= startTime) {
            data.push({
                timestamp: Math.floor(bet.createdAt.getTime() / 1000),
                yesPrice,
                volume: bet.amount
            });
        }
    }

    // Deduplicate timestamps - keep only the last entry for each unique timestamp
    const timestampMap = new Map<number, { timestamp: number; yesPrice: number; volume: number }>();
    for (const point of data) {
        timestampMap.set(point.timestamp, point);
    }
    const deduplicatedData = Array.from(timestampMap.values());

    // If too many points, downsample
    if (deduplicatedData.length > 100) {
        const sampledData = [];
        const step = Math.ceil(deduplicatedData.length / 100);
        for (let i = 0; i < deduplicatedData.length; i += step) {
            sampledData.push(deduplicatedData[i]);
        }
        // Always include the last point
        if (sampledData[sampledData.length - 1] !== deduplicatedData[deduplicatedData.length - 1]) {
            sampledData.push(deduplicatedData[deduplicatedData.length - 1]);
        }
        return sampledData;
    }

    return deduplicatedData;
}