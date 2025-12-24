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
const BUCKET_MS = 5 * 60 * 1000; // 5-minute buckets for odds history

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

        // Calculate mid price
        const bestBid = bids.length > 0 ? Number(bids[0]?.price ?? bids[0]?.[0]) : null;
        const bestAsk = asks.length > 0 ? Number(asks[0]?.price ?? asks[0]?.[0]) : null;

        if (bestBid != null && bestAsk != null) {
            return (bestBid + bestAsk) / 2;
        } else if (bestAsk != null) {
            return bestAsk;
        } else if (bestBid != null) {
            return bestBid;
        }

        return null;
    } catch (error) {
        console.warn(`[Odds Cron] Failed to fetch price for token ${tokenId}:`, error);
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

        return null;
    } catch (error) {
        console.warn(`[Odds Cron] Failed to fetch market ${polymarketId}:`, error);
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
        const eventIds = mappings.map(m => m.internalEventId).filter(Boolean);
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
        const eventById = new Map(events.map(e => [e.id, e]));

        // Filter mappings to only those with active events
        const activeMappings = mappings.filter(m => eventById.has(m.internalEventId));

        if (!activeMappings.length) {
            return NextResponse.json({
                message: 'No active Polymarket events found',
                updated: 0,
                historyRows: 0,
                elapsedMs: Date.now() - start,
            });
        }

        console.log(`[Odds Cron] Processing ${activeMappings.length} active mappings`);

        const bucketTs = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
        const historyBatch: any[] = [];

        for (const mapping of activeMappings) {
            try {
                const event = eventById.get(mapping.internalEventId);
                if (!event) continue;

                const outcomeMapping = mapping.outcomeMapping as any;
                const outcomes = outcomeMapping?.outcomes || [];

                // Try to get prices from CLOB API first (most accurate)
                const pricesFromClob: Map<string, number> = new Map();

                for (const outcome of outcomes) {
                    const tokenId = outcome.polymarketId || outcome.polymarketTokenId;
                    if (tokenId) {
                        const price = await fetchTokenPrice(tokenId);
                        if (price !== null) {
                            pricesFromClob.set(tokenId, price);
                        }
                    }
                }

                // Fallback to Gamma API if CLOB didn't return prices
                if (pricesFromClob.size === 0) {
                    const marketData = await fetchMarketPrices(mapping.polymarketId);
                    if (marketData) {
                        const prices = parseOutcomePrices(marketData.outcomePrices);

                        // Map prices to tokens
                        if (marketData.tokens && Array.isArray(marketData.tokens)) {
                            for (let i = 0; i < marketData.tokens.length; i++) {
                                const token = marketData.tokens[i];
                                const tokenId = token.token_id || token.tokenId;
                                const price = Number(token.price || prices[i]);
                                if (tokenId && Number.isFinite(price)) {
                                    pricesFromClob.set(tokenId, price);
                                }
                            }
                        } else if (prices.length > 0) {
                            // Use position-based mapping for outcomes
                            for (let i = 0; i < Math.min(outcomes.length, prices.length); i++) {
                                const tokenId = outcomes[i]?.polymarketId || outcomes[i]?.polymarketTokenId;
                                if (tokenId) {
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

                // Broadcast updates via Redis for real-time clients
                if (redis && updates.length > 0) {
                    const lastUpdate = updates[updates.length - 1];
                    try {
                        await redis.publish('sports-odds', JSON.stringify({
                            eventId: event.id,
                            probability: lastUpdate.probability,
                            timestamp: Date.now(),
                        }));
                    } catch {
                        // Ignore Redis errors
                    }
                }
            } catch (mappingError) {
                console.warn(`[Odds Cron] Error processing mapping ${mapping.id}:`, mappingError);
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
                console.log(`[Odds Cron] Stored ${historyRows} odds history rows`);
            } catch (historyError) {
                console.warn('[Odds Cron] Failed to store odds history:', historyError);
            }
        }

        console.log(`[Odds Cron] Updated ${updates.length} outcomes across ${activeMappings.length} events`);

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
