/**
 * Polymarket Odds Cron
 * 
 * Scheduled endpoint that continuously updates odds for mapped Polymarket events.
 * Uses the CLOB API for most up-to-date prices.
 * 
 * Should be called every 2-5 minutes via Vercel cron.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

const CLOB_API_BASE = 'https://clob.polymarket.com';
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const BUCKET_MS = 30 * 60 * 1000; // 30-minute buckets for odds history - consistent with historical backfill

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

interface OddsUpdate {
    eventId: string;
    outcomeId: string;
    tokenId: string;
    price: number;
    probability: number;
}

interface MarketData {
    tokens?: Array<{
        token_id?: string;
        tokenId?: string;
        outcome?: string;
        price?: number | string;
    }>;
    outcomePrices?: number[] | string;
    outcomes?: any[] | string;
}

/**
 * Fetch current prices from CLOB API for a token
 */
async function fetchTokenPrice(tokenId: string): Promise<number | null> {
    try {
        // Use orderbook endpoint for real-time mid price
        const response = await fetch(`${CLOB_API_BASE}/book?token_id=${tokenId}`, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const bids = data.bids || [];
        const asks = data.asks || [];

        // Calculate mid price correctly by finding MAX bid and MIN ask
        // Polymarket sometimes returns bids/asks sorted by time or in arbitrary order
        let bestBid: number | null = null;
        let bestAsk: number | null = null;

        for (const bid of bids) {
            const p = Number(bid?.price ?? bid?.[0]);
            if (Number.isFinite(p)) {
                if (bestBid === null || p > bestBid) bestBid = p;
            }
        }

        for (const ask of asks) {
            const p = Number(ask?.price ?? ask?.[0]);
            if (Number.isFinite(p)) {
                if (bestAsk === null || p < bestAsk) bestAsk = p;
            }
        }

        if (bestBid != null && bestAsk != null) {
            return (bestBid + bestAsk) / 2;
        } else if (bestAsk != null) {
            return bestAsk;
        } else if (bestBid != null) {
            return bestBid;
        }

        return null;
    } catch (error) {
        console.warn('[Odds Cron] Failed to fetch price for token', tokenId, ':', error);
        return null;
    }
}

/**
 * Fetch market data from Gamma API with outcome prices
 */
async function fetchMarketPrices(polymarketId: string): Promise<MarketData | null> {
    try {
        const response = await fetch(
            `${GAMMA_API_BASE}/markets?id=${polymarketId}&limit=1`,
            {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            return data[0];
        }

        // Fallback: try events API if market API returned nothing
        // This is common for GROUPED_BINARY events where we store the event ID
        const eventResponse = await fetch(
            `${GAMMA_API_BASE}/events?id=${polymarketId}`,
            {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' },
            }
        );

        if (eventResponse.ok) {
            const eventData = await eventResponse.json();
            if (Array.isArray(eventData) && eventData.length > 0) {
                const evt = eventData[0];
                // For aggregated event view, consolidate outcome prices from its markets
                const markets = Array.isArray(evt.markets) ? evt.markets : [];
                const consolidatedTokenPrices: Array<{ tokenId: string, price: number }> = [];
                const consolidatedOutcomePrices: number[] = [];

                for (const mkt of markets) {
                    const mktPrices = parseOutcomePrices(mkt.outcomePrices);
                    if (mktPrices.length > 0) {
                        consolidatedOutcomePrices.push(mktPrices[0]); // Typically Yes price
                    }
                    if (Array.isArray(mkt.clobTokenIds) && mkt.clobTokenIds.length > 0) {
                        consolidatedTokenPrices.push({
                            tokenId: mkt.clobTokenIds[0],
                            price: mktPrices[0] || Number(mkt.lastTradePrice) || 0.5
                        });
                    }
                }

                return {
                    tokens: consolidatedTokenPrices.map(tp => ({ tokenId: tp.tokenId, price: tp.price })),
                    outcomePrices: consolidatedOutcomePrices,
                    outcomes: evt.outcomes
                };
            }
        }
        return null;
    } catch (error) {
        console.warn('[Odds Cron] Failed to fetch market', polymarketId, ':', error);
        return null;
    }
}

/**
 * Parse outcome prices from Polymarket response
 */
function parseOutcomePrices(raw: any): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw).map(Number);
        } catch {
            return [];
        }
    }
    return [];
}

export async function POST(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.headers.get('x-cron-secret') !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const start = Date.now();
    const updates: OddsUpdate[] = [];
    let historyRows = 0;

    try {
        const { prisma } = await import('@/lib/prisma');
        const { redis } = await import('@/lib/redis');

        // Get all active Polymarket mappings
        const mappings = await prisma.polymarketMarketMapping.findMany({
            where: {
                isActive: true,
            },
        });

        if (!mappings.length) {
            return NextResponse.json({
                message: 'No active Polymarket mappings',
                updated: 0,
                historyRows: 0,
                elapsedMs: Date.now() - start,
            });
        }

        // Get the associated events (manual join since no relation exists)
        const eventIds = mappings.map((m: { internalEventId: string | null }) => m.internalEventId).filter(Boolean);
        const events = await prisma.event.findMany({
            where: {
                id: { in: eventIds },
                status: 'ACTIVE',
                source: 'POLYMARKET',
            },
            select: {
                id: true,
                title: true,
                type: true,
                qYes: true,
                qNo: true,
                liquidityParameter: true,
            },
        });

        // Build a lookup map
        type EventType = {
            id: string;
            title: string | null;
            type: string | null;
            qYes: number | null;
            qNo: number | null;
            liquidityParameter: number | null;
        };
        const eventById = new Map<string, EventType>(events.map((e: EventType) => [e.id, e]));

        // Filter mappings to only those with active events
        const activeMappings = mappings.filter((m: { internalEventId: string | null }) => m.internalEventId !== null && eventById.has(m.internalEventId));

        if (!activeMappings.length) {
            return NextResponse.json({
                message: 'No active Polymarket events found',
                updated: 0,
                historyRows: 0,
                elapsedMs: Date.now() - start,
            });
        }

        console.log('[Odds Cron] Processing', activeMappings.length, 'active mappings');

        const bucketTs = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
        const historyBatch: any[] = [];

        for (const mapping of activeMappings) {
            try {
                const event = eventById.get(mapping.internalEventId);
                if (!event) continue;

                const outcomeMapping = mapping.outcomeMapping as any;
                const outcomes = outcomeMapping?.outcomes || [];

                // Try to get prices from CLOB API in parallel (most accurate)
                // Use a small chunk size to avoid overwhelming the API
                const pricesFromClob: Map<string, number> = new Map();
                const pricePromises = outcomes.map(async (outcome: any) => {
                    const tokenId = outcome.polymarketId || outcome.polymarketTokenId;
                    if (tokenId) {
                        const price = await fetchTokenPrice(tokenId);
                        return { tokenId, price };
                    }
                    return null;
                });

                const results = await Promise.all(pricePromises);
                for (const res of results) {
                    if (res && res.price !== null) {
                        pricesFromClob.set(res.tokenId, res.price);
                    }
                }

                // Fallback to Gamma API if CLOB didn't return (all) prices
                if (pricesFromClob.size < outcomes.length) {
                    const marketData = await fetchMarketPrices(mapping.polymarketId);
                    if (marketData) {
                        const prices = parseOutcomePrices(marketData.outcomePrices);

                        // Map prices to tokens
                        if (marketData.tokens && Array.isArray(marketData.tokens)) {
                            for (let i = 0; i < marketData.tokens.length; i++) {
                                const token = marketData.tokens[i];
                                const tokenId = token.token_id || token.tokenId;
                                const price = Number(token.price || prices[i]);
                                if (tokenId && Number.isFinite(price) && !pricesFromClob.has(tokenId)) {
                                    pricesFromClob.set(tokenId, price);
                                }
                            }
                        } else if (prices.length > 0) {
                            // Use position-based mapping for outcomes
                            for (let i = 0; i < Math.min(outcomes.length, prices.length); i++) {
                                const tokenId = outcomes[i]?.polymarketId || outcomes[i]?.polymarketTokenId;
                                if (tokenId && !pricesFromClob.has(tokenId)) {
                                    pricesFromClob.set(tokenId, prices[i]);
                                }
                            }
                        }
                    }
                }

                // Get our internal outcomes for this event
                const dbOutcomes = await prisma.outcome.findMany({
                    where: { eventId: event.id },
                    select: { id: true, name: true, probability: true, polymarketOutcomeId: true },
                });

                // Build a lookup map
                const outcomeIdByPolyId = new Map<string, string>();
                const outcomeIdByName = new Map<string, string>();
                for (const o of dbOutcomes) {
                    if (o.polymarketOutcomeId) {
                        outcomeIdByPolyId.set(o.polymarketOutcomeId, o.id);
                    }
                    outcomeIdByName.set(o.name.toLowerCase(), o.id);
                }

                // Update each outcome's probability
                for (const outcome of outcomes) {
                    const tokenId = outcome.polymarketId || outcome.polymarketTokenId;
                    if (!tokenId) continue;

                    const price = pricesFromClob.get(tokenId);
                    if (price === undefined) continue;

                    // Find our internal outcome ID
                    let outcomeId = outcomeIdByPolyId.get(tokenId);
                    if (!outcomeId && outcome.name) {
                        outcomeId = outcomeIdByName.get(outcome.name.toLowerCase());
                    }

                    if (!outcomeId) continue;

                    const probability = clamp01(price);

                    // Update outcome probability
                    await prisma.outcome.update({
                        where: { id: outcomeId },
                        data: { probability },
                    });

                    updates.push({
                        eventId: event.id,
                        outcomeId,
                        tokenId,
                        price,
                        probability,
                    });

                    // Prepare odds history entry
                    historyBatch.push({
                        eventId: event.id,
                        outcomeId,
                        polymarketTokenId: tokenId,
                        timestamp: new Date(bucketTs),
                        price,
                        probability,
                        source: 'POLYMARKET',
                    });
                }

                // For binary events, also update qYes/qNo
                if (event.type === 'BINARY' && pricesFromClob.size > 0) {
                    const yesTokenId = mapping.yesTokenId;
                    const noTokenId = mapping.noTokenId;

                    let yesPrice = yesTokenId ? pricesFromClob.get(yesTokenId) : undefined;
                    let noPrice = noTokenId ? pricesFromClob.get(noTokenId) : undefined;

                    // If we only have one price, infer the other
                    if (yesPrice !== undefined && noPrice === undefined) {
                        noPrice = 1 - yesPrice;
                    } else if (noPrice !== undefined && yesPrice === undefined) {
                        yesPrice = 1 - noPrice;
                    }

                    if (yesPrice !== undefined && noPrice !== undefined) {
                        const b = event.liquidityParameter || 20000;

                        // Convert probabilities to qYes/qNo using inverse LMSR
                        const qYes = yesPrice > 0.01 && yesPrice < 0.99
                            ? b * Math.log(yesPrice / (1 - yesPrice))
                            : 0;
                        const qNo = noPrice > 0.01 && noPrice < 0.99
                            ? b * Math.log(noPrice / (1 - noPrice))
                            : 0;

                        await prisma.event.update({
                            where: { id: event.id },
                            data: { qYes, qNo },
                        });
                    }
                }

                // Update mapping's lastSyncedAt
                await prisma.polymarketMarketMapping.update({
                    where: { id: mapping.id },
                    data: { lastSyncedAt: new Date() },
                });

                // Broadcast updates via Redis for real-time clients
                if (redis && updates.length > 0) {
                    const lastUpdate = updates[updates.length - 1];
                    try {
                        const payload = {
                            eventId: event.id,
                            probability: lastUpdate.probability,
                            timestamp: Date.now(),
                        };

                        await redis.publish('sports-odds', JSON.stringify(payload));

                        // Push to Frontend via Soketi
                        const { getPusherServer } = await import('@/lib/pusher-server');
                        const pusher = getPusherServer();

                        await pusher.trigger(`event-${event.id}`, 'odds-update', {
                            eventId: event.id,
                            timestamp: payload.timestamp,
                            outcomes: updates.filter(u => u.eventId === event.id).map(u => ({
                                id: u.outcomeId,
                                probability: u.probability
                            }))
                        });

                    } catch {
                        // Ignore Redis/Pusher errors
                    }
                }
            } catch (mappingError) {
                console.warn('[Odds Cron] Error processing mapping', mapping.id, ':', mappingError);
            }
        }

        // Batch insert odds history
        if (historyBatch.length > 0) {
            try {
                const result = await prisma.oddsHistory.createMany({
                    data: historyBatch,
                    skipDuplicates: true,
                });
                historyRows = result.count;
                console.log('[Odds Cron] Stored', historyRows, 'odds history rows');

                // Trigger background refresh of the hourly materialized view
                // This is fire-and-forget, runs after response is sent
                if (historyRows > 0) {
                    const { triggerBackgroundRefresh } = await import('@/lib/odds-history-refresh');
                    triggerBackgroundRefresh();
                }
            } catch (historyError) {
                console.warn('[Odds Cron] Failed to store odds history:', historyError);
            }
        }

        console.log('[Odds Cron] Updated', updates.length, 'outcomes across', activeMappings.length, 'events');

        return NextResponse.json({
            updated: updates.length,
            mappingsProcessed: activeMappings.length,
            historyRows,
            elapsedMs: Date.now() - start,
        });
    } catch (error) {
        console.error('[Odds Cron] Fatal error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    return POST(request);
}
