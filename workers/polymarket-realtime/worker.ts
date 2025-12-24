/**
 * Polymarket Real-Time Data Worker
 * 
 * Connects to Polymarket's WebSocket API using their official real-time-data-client
 * to receive live price updates and store them in the database.
 * 
 * This runs as a persistent container alongside the main app.
 */

import { RealTimeDataClient, type Message } from '@polymarket/real-time-data-client';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const ODDS_HISTORY_BUCKET_MS = 5 * 60 * 1000; // 5 minutes

if (!DATABASE_URL) {
    console.error('[Worker] DATABASE_URL is required');
    process.exit(1);
}

// Initialize clients
const prisma = new PrismaClient({
    log: ['error', 'warn'],
});

let redis: Redis | null = null;
if (REDIS_URL) {
    redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
    });
    redis.on('error', (err) => console.error('[Redis] Error:', err.message));
}

// In-memory caches
interface MarketMapping {
    internalEventId: string;
    polymarketId: string;
    yesTokenId: string | null;
    noTokenId: string | null;
    outcomeMapping: Array<{
        internalId: string;
        polymarketId: string;
        name: string;
    }>;
    eventType: string;
    liquidityParameter: number;
}

let marketMappings: Map<string, MarketMapping> = new Map(); // tokenId -> mapping
let lastPrices: Map<string, number> = new Map(); // tokenId -> price
let subscriptionTokenIds: string[] = [];
let wsClient: RealTimeDataClient | null = null;

/**
 * Load active Polymarket market mappings from database
 */
async function loadMappings(): Promise<void> {
    console.log('[Worker] Loading active market mappings...');

    const mappings = await prisma.polymarketMarketMapping.findMany({
        where: { isActive: true },
    });

    if (!mappings.length) {
        console.log('[Worker] No active mappings found');
        return;
    }

    // Get associated events
    const eventIds = mappings.map(m => m.internalEventId).filter(Boolean);
    const events = await prisma.event.findMany({
        where: {
            id: { in: eventIds },
            status: 'ACTIVE',
            source: 'POLYMARKET',
        },
        select: {
            id: true,
            type: true,
            liquidityParameter: true,
        },
    });
    const eventById = new Map(events.map(e => [e.id, e]));

    // Build token -> mapping lookup
    const newMappings = new Map<string, MarketMapping>();
    const tokenIds: string[] = [];

    for (const mapping of mappings) {
        const event = eventById.get(mapping.internalEventId);
        if (!event) continue;

        const outcomeMapping = (mapping.outcomeMapping as any)?.outcomes || [];

        const marketMapping: MarketMapping = {
            internalEventId: mapping.internalEventId,
            polymarketId: mapping.polymarketId,
            yesTokenId: mapping.yesTokenId,
            noTokenId: mapping.noTokenId,
            outcomeMapping,
            eventType: event.type,
            liquidityParameter: event.liquidityParameter || 20000,
        };

        // Index by YES/NO token IDs
        if (mapping.yesTokenId) {
            newMappings.set(mapping.yesTokenId, marketMapping);
            tokenIds.push(mapping.yesTokenId);
        }
        if (mapping.noTokenId) {
            newMappings.set(mapping.noTokenId, marketMapping);
            tokenIds.push(mapping.noTokenId);
        }

        // Index by outcome token IDs
        for (const outcome of outcomeMapping) {
            if (outcome.polymarketId) {
                newMappings.set(outcome.polymarketId, marketMapping);
                tokenIds.push(outcome.polymarketId);
            }
        }
    }

    marketMappings = newMappings;
    subscriptionTokenIds = [...new Set(tokenIds)]; // Dedupe

    console.log(`[Worker] Loaded ${mappings.length} mappings, ${subscriptionTokenIds.length} unique token IDs`);
}

/**
 * Clamp value to 0-1 range
 */
function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

/**
 * Update outcome probability in database
 */
async function updateOutcomeProbability(
    eventId: string,
    tokenId: string,
    price: number,
    mapping: MarketMapping
): Promise<void> {
    const probability = clamp01(price);

    // Find matching outcome in our database
    let outcomeId: string | null = null;

    // For binary events, map YES/NO based on token ID
    if (mapping.eventType === 'BINARY') {
        const isYes = tokenId === mapping.yesTokenId;
        const outcomeMatch = await prisma.outcome.findFirst({
            where: {
                eventId,
                name: { in: isYes ? ['YES', 'Yes', 'yes'] : ['NO', 'No', 'no'] },
            },
            select: { id: true },
        });
        outcomeId = outcomeMatch?.id || null;
    } else {
        // For MULTIPLE, find by polymarketOutcomeId
        const outcomeMatch = await prisma.outcome.findFirst({
            where: {
                eventId,
                polymarketOutcomeId: tokenId,
            },
            select: { id: true },
        });
        outcomeId = outcomeMatch?.id || null;
    }

    if (!outcomeId) {
        console.warn(`[Worker] No outcome found for event ${eventId}, token ${tokenId}`);
        return;
    }

    // Update outcome probability
    await prisma.outcome.update({
        where: { id: outcomeId },
        data: { probability },
    });

    // For binary events, also update qYes/qNo
    if (mapping.eventType === 'BINARY') {
        const isYes = tokenId === mapping.yesTokenId;
        const b = mapping.liquidityParameter;

        // Get the opposite price (from cache or calculate)
        const oppositeTokenId = isYes ? mapping.noTokenId : mapping.yesTokenId;
        const oppositePrice = oppositeTokenId ? (lastPrices.get(oppositeTokenId) ?? (1 - price)) : (1 - price);

        const yesPrice = isYes ? price : oppositePrice;
        const noPrice = isYes ? oppositePrice : price;

        // Convert to qYes/qNo using inverse LMSR
        const qYes = yesPrice > 0.01 && yesPrice < 0.99
            ? b * Math.log(yesPrice / (1 - yesPrice))
            : 0;
        const qNo = noPrice > 0.01 && noPrice < 0.99
            ? b * Math.log(noPrice / (1 - noPrice))
            : 0;

        await prisma.event.update({
            where: { id: eventId },
            data: { qYes, qNo },
        });
    }

    // Store odds history (bucketed to 5-minute intervals)
    const bucketTs = Math.floor(Date.now() / ODDS_HISTORY_BUCKET_MS) * ODDS_HISTORY_BUCKET_MS;
    try {
        await prisma.oddsHistory.upsert({
            where: {
                eventId_outcomeId_timestamp: {
                    eventId,
                    outcomeId,
                    timestamp: new Date(bucketTs),
                },
            },
            update: {
                price,
                probability,
            },
            create: {
                eventId,
                outcomeId,
                polymarketTokenId: tokenId,
                timestamp: new Date(bucketTs),
                price,
                probability,
                source: 'POLYMARKET',
            },
        });
    } catch (err) {
        // Ignore duplicate key errors
    }

    // Broadcast update via Redis
    if (redis) {
        try {
            await redis.publish('sports-odds', JSON.stringify({
                eventId,
                outcomeId,
                probability,
                price,
                timestamp: Date.now(),
            }));
        } catch {
            // Ignore Redis errors
        }
    }
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(message: Message): Promise<void> {
    const { topic, type, payload } = message;

    if (DRY_RUN) {
        console.log(`[DRY_RUN] ${topic}/${type}:`, JSON.stringify(payload).slice(0, 200));
        return;
    }

    try {
        if (topic === 'clob-market') {
            if (type === 'last-trade-price') {
                // LastTradePrice: { asset_id, market, price, side, size, fee_rate_bps }
                const { asset_id, price } = payload as any;
                if (!asset_id || price === undefined) return;

                const priceNum = parseFloat(price);
                if (!Number.isFinite(priceNum)) return;

                // Update cache
                lastPrices.set(asset_id, priceNum);

                // Find mapping for this token
                const mapping = marketMappings.get(asset_id);
                if (!mapping) return;

                await updateOutcomeProbability(mapping.internalEventId, asset_id, priceNum, mapping);
                console.log(`[Worker] Updated ${asset_id}: ${(priceNum * 100).toFixed(1)}%`);
            } else if (type === 'price-change') {
                // PriceChanges: { m (market), pc (price changes array), t (timestamp) }
                const { pc } = payload as any;
                if (!Array.isArray(pc)) return;

                for (const change of pc) {
                    const { a: assetId, p: price, bb: bestBid, ba: bestAsk } = change;
                    if (!assetId) continue;

                    // Use mid price if available, otherwise last trade price
                    let priceNum: number;
                    if (bestBid && bestAsk) {
                        priceNum = (parseFloat(bestBid) + parseFloat(bestAsk)) / 2;
                    } else if (price) {
                        priceNum = parseFloat(price);
                    } else {
                        continue;
                    }

                    if (!Number.isFinite(priceNum)) continue;

                    // Update cache
                    lastPrices.set(assetId, priceNum);

                    // Find mapping
                    const mapping = marketMappings.get(assetId);
                    if (!mapping) continue;

                    await updateOutcomeProbability(mapping.internalEventId, assetId, priceNum, mapping);
                }
            }
        }
    } catch (err) {
        console.error('[Worker] Error handling message:', err);
    }
}

/**
 * Connect to Polymarket WebSocket and subscribe to markets
 */
function connect(): void {
    console.log('[Worker] Connecting to Polymarket WebSocket...');

    const onConnect = (client: RealTimeDataClient): void => {
        console.log('[Worker] Connected! Subscribing to markets...');
        wsClient = client;

        if (subscriptionTokenIds.length === 0) {
            console.log('[Worker] No token IDs to subscribe to');
            return;
        }

        // Subscribe to LastTradePrice and PriceChanges for our tokens
        // Filter format for clob-market: JSON array of token IDs
        const filter = JSON.stringify(subscriptionTokenIds);

        client.subscribe({
            subscriptions: [
                {
                    topic: 'clob-market',
                    type: 'last-trade-price',
                    filters: filter,
                },
                {
                    topic: 'clob-market',
                    type: 'price-change',
                    filters: filter,
                },
            ],
        });

        console.log(`[Worker] Subscribed to ${subscriptionTokenIds.length} token IDs`);
    };

    const onMessage = (message: Message): void => {
        handleMessage(message).catch(err => {
            console.error('[Worker] Async error:', err);
        });
    };

    const onDisconnect = (): void => {
        console.log('[Worker] Disconnected from WebSocket');
        wsClient = null;

        // Reconnect after delay
        setTimeout(() => {
            console.log('[Worker] Reconnecting...');
            connect();
        }, 5000);
    };

    const onError = (error: Error): void => {
        console.error('[Worker] WebSocket error:', error.message);
    };

    new RealTimeDataClient({
        onMessage,
        onConnect,
        onDisconnect,
        onError,
    }).connect();
}

/**
 * Refresh mappings periodically to pick up new events
 */
async function refreshMappings(): Promise<void> {
    try {
        const oldCount = subscriptionTokenIds.length;
        await loadMappings();

        if (subscriptionTokenIds.length !== oldCount && wsClient) {
            console.log('[Worker] Mappings changed, resubscribing...');

            const filter = JSON.stringify(subscriptionTokenIds);
            wsClient.subscribe({
                subscriptions: [
                    {
                        topic: 'clob-market',
                        type: 'last-trade-price',
                        filters: filter,
                    },
                    {
                        topic: 'clob-market',
                        type: 'price-change',
                        filters: filter,
                    },
                ],
            });
        }
    } catch (err) {
        console.error('[Worker] Error refreshing mappings:', err);
    }
}

/**
 * Graceful shutdown
 */
function shutdown(): void {
    console.log('[Worker] Shutting down...');

    if (wsClient) {
        wsClient.disconnect();
    }

    if (redis) {
        redis.quit();
    }

    prisma.$disconnect().finally(() => {
        process.exit(0);
    });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    console.log('[Worker] Polymarket Real-Time Data Worker starting...');
    console.log(`[Worker] DRY_RUN: ${DRY_RUN}`);
    console.log(`[Worker] REDIS_URL: ${REDIS_URL ? 'configured' : 'not configured'}`);

    // Handle shutdown signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Load initial mappings
    await loadMappings();

    if (subscriptionTokenIds.length === 0) {
        console.log('[Worker] No tokens to subscribe to. Waiting for mappings...');
    }

    // Connect to WebSocket
    connect();

    // Refresh mappings every 5 minutes
    setInterval(refreshMappings, 5 * 60 * 1000);

    // Heartbeat log
    setInterval(() => {
        console.log(`[Worker] Heartbeat: ${subscriptionTokenIds.length} subscriptions, ${lastPrices.size} cached prices`);
    }, HEARTBEAT_INTERVAL_MS);
}

main().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});
