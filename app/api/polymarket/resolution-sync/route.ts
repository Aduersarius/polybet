/**
 * Polymarket Resolution Sync
 * 
 * Polls Polymarket's Gamma API for resolved markets and automatically
 * triggers resolution on our platform when a mapped event is resolved.
 * 
 * Should be called by a cron job every 5-10 minutes.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

interface PolymarketMarket {
    id: string;
    conditionId?: string;
    slug?: string;
    question?: string;
    closed: boolean;
    active: boolean;
    archived?: boolean;
    resolutionSource?: string;
    endDate?: string;
    outcomes?: string | any[];
    outcomePrices?: string | number[];
    tokens?: any[];
    winningOutcome?: string;
    groupItemTitle?: string;
}

interface PolymarketEvent {
    id: string;
    slug?: string;
    title?: string;
    closed: boolean;
    active: boolean;
    markets?: PolymarketMarket[] | string;
}

interface ResolutionResult {
    eventId: string;
    polymarketId: string;
    title: string;
    winningOutcome: string;
    success: boolean;
    error?: string;
    payoutResult?: {
        winnersCount: number;
        totalPayout: number;
        totalFees: number;
    };
}

// Parse outcomes safely
function parseOutcomes(raw: any): Array<{ name: string; id?: string; outcome?: string }> {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

// Parse outcome prices safely
function parseOutcomePrices(raw: any): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(Number) : [];
        } catch {
            return [];
        }
    }
    return [];
}

// Parse markets safely
function parseMarkets(raw: any): PolymarketMarket[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * Determines the winning outcome from Polymarket market data.
 * 
 * When a market is resolved:
 * - The winning outcome will have price = 1.0 (or very close)
 * - The losing outcome(s) will have price = 0.0 (or very close)
 * - Some markets have an explicit `winningOutcome` field
 */
function determineWinningOutcome(market: PolymarketMarket): string | null {
    // Check for explicit winning outcome field
    if (market.winningOutcome) {
        return market.winningOutcome;
    }

    const outcomes = parseOutcomes(market.outcomes);
    const prices = parseOutcomePrices(market.outcomePrices);

    if (outcomes.length === 0 || prices.length === 0) {
        return null;
    }

    // Find the outcome with price close to 1.0 (winner)
    for (let i = 0; i < Math.min(outcomes.length, prices.length); i++) {
        const price = prices[i];
        if (price >= 0.95) {
            // Winner (price ~= 1.0)
            const outcome = outcomes[i];
            return typeof outcome === 'string' ? outcome : outcome.name || outcome.outcome || `Outcome ${i}`;
        }
    }

    // Check tokens array if available (more reliable)
    if (market.tokens && Array.isArray(market.tokens)) {
        for (const token of market.tokens) {
            const price = Number(token.price ?? token.lastTradePrice ?? 0);
            if (price >= 0.95) {
                return token.outcome || token.name || null;
            }
        }
    }

    return null;
}

/**
 * Fetch resolved events from Polymarket's Gamma API
 */
async function fetchResolvedMarkets(): Promise<PolymarketEvent[]> {
    try {
        // Fetch recently closed events (last 24 hours worth of resolved markets)
        const response = await fetch(
            `${GAMMA_API_BASE}/events?closed=true&active=false&limit=100&order=endDate&ascending=false`,
            {
                cache: 'no-store',
                headers: {
                    'User-Agent': 'pariflow-resolution-sync/1.0',
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            console.error('[Resolution Sync] Gamma API error:', response.status);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('[Resolution Sync] Failed to fetch resolved markets:', error);
        return [];
    }
}

export async function POST(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.headers.get('x-cron-secret') !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const start = Date.now();
    const results: ResolutionResult[] = [];

    try {
        const { prisma } = await import('@/lib/prisma');
        const { resolveMarket } = await import('@/lib/hybrid-trading');

        // Step 1: Get all active Polymarket mappings
        const mappings = await prisma.polymarketMarketMapping.findMany({
            where: {
                isActive: true,
            },
        });

        if (!mappings.length) {
            return NextResponse.json({
                message: 'No active Polymarket mappings found',
                checked: 0,
                resolved: 0,
                elapsedMs: Date.now() - start,
            });
        }

        // Get associated events (manual join)
        const eventIds = mappings.map((m: { internalEventId: string | null }) => m.internalEventId).filter(Boolean);
        const events = await prisma.event.findMany({
            where: {
                id: { in: eventIds },
                status: { in: ['ACTIVE', 'CLOSED'] }, // Not already RESOLVED
                source: 'POLYMARKET',
            },
            select: {
                id: true,
                title: true,
                status: true,
                type: true,
                polymarketId: true,
            },
        });

        // Build lookup map
        type EventType = {
            id: string;
            title: string | null;
            status: string;
            type: string | null;
            polymarketId: string | null;
        };
        const eventById = new Map<string, EventType>(events.map((e: EventType) => [e.id, e]));

        // Filter mappings to those with non-resolved events
        const activeMappings = mappings.filter((m: { internalEventId: string | null }) => m.internalEventId !== null && eventById.has(m.internalEventId));

        if (!activeMappings.length) {
            return NextResponse.json({
                message: 'No non-resolved Polymarket events found',
                checked: 0,
                resolved: 0,
                elapsedMs: Date.now() - start,
            });
        }

        console.log(`[Resolution Sync] Checking ${activeMappings.length} mapped events for resolution`);

        // Step 2: Fetch resolved events from Polymarket
        const resolvedEvents = await fetchResolvedMarkets();
        const resolvedMap = new Map<string, PolymarketEvent>();

        for (const event of resolvedEvents) {
            resolvedMap.set(event.id, event);
            if (event.slug) {
                resolvedMap.set(event.slug, event);
            }
        }

        // Step 3: Check each mapping for resolution
        for (const mapping of activeMappings) {
            try {
                const polyId = mapping.polymarketId;
                const event = eventById.get(mapping.internalEventId);

                if (!event || event.status === 'RESOLVED') {
                    continue;
                }

                // Try to find in already-fetched resolved events
                let polymarketEvent = resolvedMap.get(polyId);

                // If not in resolved list, fetch directly to check status
                if (!polymarketEvent) {
                    const directResponse = await fetch(
                        `${GAMMA_API_BASE}/events?id=${polyId}&limit=1`,
                        {
                            cache: 'no-store',
                            headers: {
                                'User-Agent': 'pariflow-resolution-sync/1.0',
                                'Accept': 'application/json',
                            },
                        }
                    );

                    if (directResponse.ok) {
                        const directData = await directResponse.json();
                        if (Array.isArray(directData) && directData.length > 0) {
                            polymarketEvent = directData[0];
                        }
                    }
                }

                if (!polymarketEvent) {
                    continue;
                }

                // Check if this event is actually resolved (closed = true, active = false)
                if (!polymarketEvent.closed || polymarketEvent.active) {
                    continue;
                }

                // Get markets to determine winning outcome
                const markets = parseMarkets(polymarketEvent.markets);
                if (!markets.length) {
                    console.log(`[Resolution Sync] Event ${polyId} has no markets data`);
                    continue;
                }

                // For grouped binary events, we need to find which market won
                // For single markets, determine the winning YES/NO
                let winningOutcomeId: string | null = null;
                let winningOutcomeName: string | null = null;

                if (event.type === 'MULTIPLE' || event.type === 'GROUPED_BINARY') {
                    // Find the market that won (the one with YES at 100%)
                    for (const market of markets) {
                        const winner = determineWinningOutcome(market);
                        if (winner && winner.toLowerCase() === 'yes') {
                            // This market's groupItemTitle is the winning outcome
                            winningOutcomeName = market.groupItemTitle || market.slug || market.question || null;
                            break;
                        }
                    }

                    if (winningOutcomeName) {
                        // Find our outcome ID that matches this name
                        const outcome = await prisma.outcome.findFirst({
                            where: {
                                eventId: event.id,
                                name: {
                                    contains: winningOutcomeName,
                                    mode: 'insensitive',
                                },
                            },
                            select: { id: true, name: true },
                        });
                        if (outcome) {
                            winningOutcomeId = outcome.id;
                            winningOutcomeName = outcome.name;
                        }
                    }
                } else {
                    // Binary event - check if YES or NO won
                    const market = markets[0];
                    const winner = determineWinningOutcome(market);

                    if (winner) {
                        // For binary events, winningOutcomeId is 'YES' or 'NO'
                        winningOutcomeId = winner.toUpperCase() === 'YES' ? 'YES' : 'NO';
                        winningOutcomeName = winningOutcomeId;
                    }
                }

                if (!winningOutcomeId) {
                    console.log(`[Resolution Sync] Could not determine winner for ${polyId} (${event.title})`);
                    results.push({
                        eventId: event.id,
                        polymarketId: polyId,
                        title: event.title || '',
                        winningOutcome: 'UNKNOWN',
                        success: false,
                        error: 'Could not determine winning outcome from Polymarket data',
                    });
                    continue;
                }

                console.log(`[Resolution Sync] Resolving ${event.title} with winner: ${winningOutcomeName}`);

                // Step 4: Trigger resolution
                try {
                    const payoutResult = await resolveMarket(event.id, winningOutcomeId);

                    results.push({
                        eventId: event.id,
                        polymarketId: polyId,
                        title: event.title || '',
                        winningOutcome: winningOutcomeName || winningOutcomeId,
                        success: true,
                        payoutResult,
                    });

                    // Deactivate the mapping since it's now resolved
                    await prisma.polymarketMarketMapping.update({
                        where: { id: mapping.id },
                        data: { isActive: false },
                    });

                    console.log(`[Resolution Sync] ✓ Resolved ${event.title}: ${payoutResult.winnersCount} winners, $${payoutResult.totalPayout.toFixed(2)} payout`);
                } catch (resolveError) {
                    const errorMsg = resolveError instanceof Error ? resolveError.message : String(resolveError);

                    // Skip already resolved events
                    if (errorMsg.includes('already resolved')) {
                        console.log(`[Resolution Sync] Event ${event.id} already resolved, skipping`);
                        continue;
                    }

                    results.push({
                        eventId: event.id,
                        polymarketId: polyId,
                        title: event.title || '',
                        winningOutcome: winningOutcomeName || winningOutcomeId,
                        success: false,
                        error: errorMsg,
                    });

                    console.error(`[Resolution Sync] Failed to resolve ${event.title}:`, errorMsg);
                }
            } catch (mappingError) {
                console.error(`[Resolution Sync] Error processing mapping ${mapping.id}:`, mappingError);
            }
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        return NextResponse.json({
            checked: activeMappings.length,
            resolved: successCount,
            failed: failCount,
            results,
            elapsedMs: Date.now() - start,
        });
    } catch (error) {
        console.error('[Resolution Sync] Fatal error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    return POST(request);
}
