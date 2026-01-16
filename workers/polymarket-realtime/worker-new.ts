/**
 * Polymarket Real-Time Data Worker
 * 
 * Connects to Polymarket's CLOB WebSocket API to receive live price updates
 * and store them in the database.
 * 
 * This runs as a persistent container alongside the main app.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import WebSocket from 'ws';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const ODDS_HISTORY_BUCKET_MS = 5 * 60 * 1000; // 5 minutes
const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

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
        // Use default TLS verification (true) for rediss:// connections
        tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
    });
    redis.on('error', (err) => console.error('[Redis] Error:', err.message));
}

// Types
interface EventInfo {
    id: string;
    title?: string;
    type: string;
    status?: string;
    liquidityParameter: number | null;
}

interface MappingRecord {
    id: string;
    internalEventId: string;
    polymarketId: string;
    yesTokenId: string | null;
    noTokenId: string | null;
    outcomeMapping: any;
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
let ws: WebSocket | null = null;

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
    const eventIds = mappings.map((m: MappingRecord) => m.internalEventId).filter(Boolean);
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
    const eventById = new Map<string, EventInfo>(events.map((e: EventInfo) => [e.id, e]));

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
async function handleMessage(data: string): Promise<void> {
    if (DRY_RUN) {
        console.log(`[DRY_RUN] Message:`, data.slice(0, 200));
        return;
    }

    try {
        const message = JSON.parse(data);

        // Handle price updates
        if (message.event_type === 'price_change' && message.asset_id) {
            const assetId = message.asset_id;
            const price = message.price ? parseFloat(message.price) : null;

            if (price === null || !Number.isFinite(price)) return;

            // Update cache
            lastPrices.set(assetId, price);

            // Find mapping for this token
            const mapping = marketMappings.get(assetId);
            if (!mapping) return;

            await updateOutcomeProbability(mapping.internalEventId, assetId, price, mapping);
            console.log(`[Worker] Updated ${assetId}: ${(price * 100).toFixed(1)}%`);
        }
    } catch (err) {
        console.error('[Worker] Error handling message:', err);
    }
}

/**
 * Connect to Polymarket CLOB WebSocket and subscribe to markets
 */
function connect(): void {
    console.log('[Worker] Connecting to Polymarket CLOB WebSocket...');

    ws = new WebSocket(CLOB_WS_URL);

    ws.on('open', () => {
        console.log('[Worker] Connected! Subscribing to markets...');

        if (subscriptionTokenIds.length === 0) {
            console.log('[Worker] No token IDs to subscribe to');
            return;
        }

        // Subscribe to market updates
        const subscribeMessage = {
            auth: {},
            type: 'MARKET',
            asset_ids: subscriptionTokenIds,
        };

        ws?.send(JSON.stringify(subscribeMessage));
        console.log(`[Worker] Subscribed to ${subscriptionTokenIds.length} token IDs`);
    });

    ws.on('message', (data: WebSocket.Data) => {
        handleMessage(data.toString()).catch(err => {
            console.error('[Worker] Async error:', err);
        });
    });

    ws.on('close', () => {
        console.log('[Worker] Disconnected from WebSocket');
        ws = null;

        // Reconnect after delay
        setTimeout(() => {
            console.log('[Worker] Reconnecting...');
            connect();
        }, 5000);
    });

    ws.on('error', (error) => {
        console.error('[Worker] WebSocket error:', error.message);
    });
}

/**
 * Refresh mappings periodically to pick up new events
 */
async function refreshMappings(): Promise<void> {
    try {
        const oldCount = subscriptionTokenIds.length;
        await loadMappings();

        if (subscriptionTokenIds.length !== oldCount && ws) {
            console.log('[Worker] Mappings changed, resubscribing...');

            const subscribeMessage = {
                auth: {},
                type: 'MARKET',
                asset_ids: subscriptionTokenIds,
            };

            ws.send(JSON.stringify(subscribeMessage));
        }
    } catch (err) {
        console.error('[Worker] Error refreshing mappings:', err);
    }
}

// ... rest of the file with periodic tasks continues below
// (I'll add the periodic task functions in the next file since this is getting long)
