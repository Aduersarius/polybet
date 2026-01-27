/**
 * Polymarket Data Normalization Library
 * 
 * Single source of truth for converting Polymarket API responses into our DB format.
 * Handles all 3 event types: BINARY, MULTIPLE, and GROUPED_BINARY.
 */
import { parseTeams } from './sports-classifier';



// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type EventType = 'BINARY' | 'MULTIPLE' | 'GROUPED_BINARY' | 'SPORTS';

export interface NormalizedOutcome {
    id: string;
    name: string;
    probability?: number; // 0-1 range, undefined if invalid
    price?: number; // Same as probability for display
    color?: string;
    tokenId?: string; // For trading/hedging
}

export interface NormalizedEvent {
    id: string;
    title: string;
    description: string;
    category: string;
    categories: string[];
    resolutionDate: string;
    createdAt: string;
    imageUrl: string | null;
    volume: number;
    betCount: number;
    type: EventType;
    outcomes: NormalizedOutcome[];
    // Binary-specific fields
    yesOdds?: number;
    noOdds?: number;
}

// ============================================================================
// CORE NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalize probability value to 0-1 range
 * 
 * @param raw - Raw probability value (can be percentage, decimal, or invalid)
 * @param fallback - Fallback value if raw is invalid (default: undefined)
 * @returns Normalized probability (0-1) or undefined if invalid
 * 
 * @example
 * normalizeProbability(0.6) // 0.6
 * normalizeProbability(60) // 0.6 (percentage)
 * normalizeProbability(120000) // undefined (strike price, not probability)
 * normalizeProbability(null, 0.5) // 0.5 (uses fallback)
 */
export function normalizeProbability(
    raw: unknown,
    fallback?: number
): number | undefined {
    if (raw == null) return fallback;

    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;

    // Handle percentages (0-100)
    if (n > 1 && n <= 100) return clamp01(n / 100);

    // Reject huge numbers (likely strike prices, not probabilities)
    if (n > 100) return undefined;

    return clamp01(n);
}

/**
 * Clamp number to [0, 1] range
 */
function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

/**
 * Safely convert to number with fallback
 */
function toNumber(val: unknown, fallback = 0): number {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Safely convert to array
 */
function toArray<T = any>(raw: unknown): T[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as T[]) : [];
        } catch {
            return [];
        }
    }
    return [];
}

// ============================================================================
// EVENT TYPE CLASSIFICATION
// ============================================================================

/**
 * Classify Polymarket event type based on market structure
 * 
 * Logic:
 * - BINARY: Exactly 2 outcomes (Yes/No)
 * - GROUPED_BINARY: Multiple independent binary markets (prob sum != 1)
 * - MULTIPLE: Multiple mutually exclusive outcomes (prob sum ≈ 1)
 */
export function classifyEventType(
    outcomes: NormalizedOutcome[],
    isGroupedBinaryMarket: boolean = false,
    marketData?: any
): EventType {
    // Sports Detection: Check for specific Polymarket sports fields
    if (marketData) {
        if (marketData.sportsMarketType || marketData.gameId || marketData.gameStatus) {
            return 'SPORTS';
        }

        // Keywords in question/title
        const title = (marketData.question || marketData.title || '').toLowerCase();

        // Check for matchup via parseTeams (e.g. "Team A vs Team B")
        const matchup = parseTeams(title);
        if (matchup.teamA && matchup.teamB) {
            return 'SPORTS';
        }

        const sportsKeywords = ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'tennis', 'soccer', 'esports', 'csgo', 'dota', 'match', 'winner'];
        if (sportsKeywords.some(k => title.includes(k)) && outcomes.length === 2) {
            const names = outcomes.map(o => o.name.toLowerCase().trim());
            if (!names.includes('yes') && !names.includes('no')) {
                // If it has sports keywords and non-yes/no outcomes, it's likely a sports match winner market
                return 'SPORTS';
            }
        }
    }

    // Binary: exactly 2 outcomes
    if (outcomes.length === 2) {
        const names = outcomes.map(o => o.name.toLowerCase().trim());
        if (names.includes('yes') && names.includes('no')) {
            return 'BINARY';
        }
    }

    // Grouped binary: multiple independent questions
    if (isGroupedBinaryMarket) {
        return 'GROUPED_BINARY';
    }

    // Multiple: mutually exclusive outcomes
    if (outcomes.length > 2) {
        return 'MULTIPLE';
    }

    // Default to binary for 2 outcomes
    return 'BINARY';
}

/**
 * Determine if grouped markets are mutually exclusive
 * Used to distinguish MULTIPLE from GROUPED_BINARY
 */
export function isMutuallyExclusive(outcomes: NormalizedOutcome[]): boolean {
    const validProbs = outcomes.filter(o => o.probability !== undefined);
    if (validProbs.length < 2) return false;

    const sum = validProbs.reduce((acc, o) => acc + (o.probability ?? 0), 0);

    // If sum is close to 1.0, outcomes are mutually exclusive
    return sum > 0.9 && sum < 1.1;
}

// ============================================================================
// POLYMARKET MARKET NORMALIZATION
// ============================================================================

/**
 * Normalize Polymarket market data into our Event format
 * Handles all Polymarket API response variations
 */
export function normalizePolymarketMarket(
    market: any,
    parentEvent?: any
): NormalizedEvent {
    // Extract outcomes
    const rawOutcomes = toArray(market.outcomes);
    const rawPrices = toArray(market.outcomePrices).map(p => toNumber(p));

    const outcomes: NormalizedOutcome[] = rawOutcomes.map((outcome: any, idx: number) => {
        // Handle both string outcomes ("Yes", "No") and object outcomes
        const name = typeof outcome === 'string'
            ? outcome
            : (outcome?.name ?? outcome?.label ?? outcome?.ticker ?? `Outcome ${idx + 1}`);

        // Try multiple probability sources
        const rawProb = rawPrices[idx] ??
            outcome?.price ??
            outcome?.probability ??
            outcome?.p;

        const probability = normalizeProbability(rawProb, undefined);

        return {
            id: outcome?.id ?? outcome?.slug ?? `${market.id || market.slug}-${idx}`,
            name,
            probability,
            price: probability,
            color: outcome?.color,
            tokenId: outcome?.tokenId,
        };
    });

    // Classify event type
    const isGrouped = Boolean(market.groupItemTitle);
    const type = classifyEventType(outcomes, isGrouped, market);

    // Extract binary probabilities
    let yesOdds: number | undefined;
    let noOdds: number | undefined;

    if (type === 'BINARY') {
        const yesOutcome = outcomes.find(o => /yes/i.test(o.name));
        const noOutcome = outcomes.find(o => /no/i.test(o.name));

        yesOdds = yesOutcome?.probability ?? outcomes[0]?.probability ?? 0.5;
        noOdds = noOutcome?.probability ?? outcomes[1]?.probability ?? (1 - yesOdds);

        // Ensure they sum to 1
        const sum = yesOdds + noOdds;
        if (sum > 0) {
            yesOdds = yesOdds / sum;
            noOdds = noOdds / sum;
        }
    }

    // Get best volume from multiple sources
    const volume = toNumber(
        market.volumeNum ??
        market.volume24hr ??
        market.volume ??
        parentEvent?.volumeNum ??
        parentEvent?.volume
    );

    return {
        id: market.id || market.slug || crypto.randomUUID(),
        title: market.question ?? market.title ?? parentEvent?.title ?? 'Untitled market',
        description: market.description ?? parentEvent?.description ?? '',
        category: market.category ?? parentEvent?.category ?? 'General',
        categories: toArray(market.categories || parentEvent?.categories).filter(Boolean),
        resolutionDate: market.endDate ?? market.closeTime ?? parentEvent?.endDate ?? new Date().toISOString(),
        createdAt: market.createdAt ?? parentEvent?.createdAt ?? new Date().toISOString(),
        imageUrl: market.image ?? parentEvent?.image ?? parentEvent?.icon ?? null,
        volume,
        betCount: toNumber(market.trades ?? parentEvent?.trades),
        type,
        outcomes,
        yesOdds,
        noOdds,
    };
}

/**
 * Normalize grouped binary markets into a single MULTIPLE event
 * Used for events like "Who will win?" with multiple binary markets
 */
export function normalizeGroupedBinary(
    markets: any[],
    parentEvent?: any
): NormalizedEvent {
    const outcomes: NormalizedOutcome[] = markets.map(market => {
        const prices = toArray(market.outcomePrices).map(p => toNumber(p));
        const yesProb = normalizeProbability(
            prices[0] ?? market.lastTradePrice ?? market.bestBid ?? 0.5,
            0.5
        );

        return {
            id: market.id || market.slug || crypto.randomUUID(),
            name: market.groupItemTitle || market.question || 'Outcome',
            probability: yesProb,
            price: yesProb,
            tokenId: market.clobTokenIds?.[0],
        };
    });

    // Check if mutually exclusive
    const mutuallyExclusive = isMutuallyExclusive(outcomes);
    const type: EventType = mutuallyExclusive ? 'MULTIPLE' : 'GROUPED_BINARY';

    const maxVolume = Math.max(...markets.map(m => toNumber(m.volumeNum ?? m.volume)));
    const totalBetCount = markets.reduce((sum, m) => sum + toNumber(m.trades), 0);

    return {
        id: parentEvent?.id || markets[0]?.id || crypto.randomUUID(),
        title: parentEvent?.title || markets[0]?.title || 'Untitled event',
        description: parentEvent?.description || '',
        category: parentEvent?.category || markets[0]?.category || 'General',
        categories: toArray(parentEvent?.categories).filter(Boolean),
        resolutionDate: parentEvent?.endDate || markets[0]?.endDate || new Date().toISOString(),
        createdAt: parentEvent?.createdAt || new Date().toISOString(),
        imageUrl: parentEvent?.image || parentEvent?.icon || null,
        volume: maxVolume,
        betCount: totalBetCount,
        type,
        outcomes: outcomes.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0)),
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate normalized event data
 */
export function validateNormalizedEvent(event: NormalizedEvent): boolean {
    if (!event.id || !event.title) return false;
    if (event.outcomes.length < 2) return false;

    // Binary events must have exactly 2 outcomes
    if (event.type === 'BINARY' && event.outcomes.length !== 2) return false;

    // All outcomes must have valid names
    if (event.outcomes.some(o => !o.name)) return false;

    // ✅ Validate probability sum for MULTIPLE events
    if (event.type === 'MULTIPLE' || event.type === 'GROUPED_BINARY') {
        const validOutcomes = event.outcomes.filter(o =>
            o.probability !== undefined && o.probability >= 0
        );

        if (validOutcomes.length >= 2) {
            const sum = validOutcomes.reduce((s, o) => s + (o.probability ?? 0), 0);

            // For MULTIPLE (mutually exclusive), sum should be ~1.0
            if (event.type === 'MULTIPLE' && Math.abs(sum - 1.0) > 0.1) {
                console.warn(`[Validation] ⚠️ Probability sum mismatch for ${event.id}: ${sum.toFixed(3)} (expected ~1.0)`);
                // Don't fail - just log warning
            }
        }
    }

    return true;
}

/**
 * Calculate aggregate statistics for multiple markets
 */
export function aggregateMarketStats(markets: any[]): {
    maxVolume: number;
    totalBetCount: number;
    avgPriceChange24h: number;
} {
    return {
        maxVolume: Math.max(...markets.map(m => toNumber(m.volumeNum ?? m.volume))),
        totalBetCount: markets.reduce((sum, m) => sum + toNumber(m.trades), 0),
        avgPriceChange24h: markets.reduce((sum, m) => sum + toNumber(m.oneDayPriceChange), 0) / markets.length,
    };
}
