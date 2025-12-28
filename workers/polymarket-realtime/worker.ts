/**
 * Polymarket Real-Time Data Worker
 * 
 * Connects to Polymarket's WebSocket API using their official real-time-data-client
 * to receive live price updates and store them in the database.
 * 
 * This runs as a persistent container alongside the main app.
 */

import { RealTimeDataClient, Message } from '@polymarket/real-time-data-client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const ODDS_HISTORY_BUCKET_MS = 30 * 60 * 1000; // 30 minutes - consistent with historical backfill candles

if (!DATABASE_URL) {
    console.error('[Worker] DATABASE_URL is required');
    process.exit(1);
}

// Initialize Prisma with pg adapter (Prisma 7 pattern)
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

const prisma = new PrismaClient({
    log: ['error', 'warn'],
    adapter: new PrismaPg(pool),
});

let redis: Redis | null = null;
if (REDIS_URL) {
    redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
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
        // Filter format for clob-market: JSON array of token IDs (per Polymarket docs)
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

    const onMessage = (_client: RealTimeDataClient, message: Message): void => {
        handleMessage(message).catch(err => {
            console.error('[Worker] Async error:', err);
        });
    };

    // Use onStatusChange for connection state logging
    const onStatusChange = (status: string): void => {
        console.log(`[Worker] Connection status: ${status}`);
        if (status === 'disconnected' || status === 'error') {
            wsClient = null;
        }
    };

    const client = new RealTimeDataClient({
        onMessage,
        onConnect,
        onStatusChange,
        autoReconnect: true, // Library handles reconnection automatically
    });

    client.connect();
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

// ============================================
// PERIODIC TASKS (replaces Vercel crons)
// ============================================

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

interface PolymarketMarket {
    id: string;
    closed: boolean;
    active: boolean;
    outcomes?: string | any[];
    outcomePrices?: string | number[];
    tokens?: any[];
    winningOutcome?: string;
    groupItemTitle?: string;
    slug?: string;
    question?: string;
}

interface PolymarketEvent {
    id: string;
    slug?: string;
    title?: string;
    closed: boolean;
    active: boolean;
    markets?: PolymarketMarket[] | string;
}

function parsePolyOutcomes(raw: any): Array<{ name: string; id?: string; outcome?: string }> {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) || [];
        } catch { return []; }
    }
    return [];
}

function parsePolyPrices(raw: any): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === 'string') {
        try { return JSON.parse(raw).map(Number); } catch { return []; }
    }
    return [];
}

function parsePolyMarkets(raw: any): PolymarketMarket[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw) || []; } catch { return []; }
    }
    return [];
}

function determineWinner(market: PolymarketMarket): string | null {
    if (market.winningOutcome) return market.winningOutcome;
    const outcomes = parsePolyOutcomes(market.outcomes);
    const prices = parsePolyPrices(market.outcomePrices);
    for (let i = 0; i < Math.min(outcomes.length, prices.length); i++) {
        if (prices[i] >= 0.95) {
            const o = outcomes[i];
            return typeof o === 'string' ? o : o.name || o.outcome || `Outcome ${i}`;
        }
    }
    if (market.tokens && Array.isArray(market.tokens)) {
        for (const t of market.tokens) {
            if (Number(t.price ?? t.lastTradePrice ?? 0) >= 0.95) {
                return t.outcome || t.name || null;
            }
        }
    }
    return null;
}

/**
 * Reconcile hedge orders and close expired events
 * Runs every 5 minutes
 */
async function runReconciliation(): Promise<void> {
    if (DRY_RUN) {
        console.log('[Reconcile] Skipped (DRY_RUN)');
        return;
    }

    console.log('[Reconcile] Starting...');
    const start = Date.now();

    try {
        // Check for open Polymarket orders
        const openOrders = await prisma.polyOrder.findMany({
            where: { status: { in: ['pending', 'placed', 'partial'] }, polymarketOrderId: { not: null } },
            take: 50,
        });

        let updated = 0;
        // Note: We skip order status checks here since polymarketTrading requires keys
        // Just close expired events

        const now = new Date();
        const closedEvents = await prisma.event.updateMany({
            where: {
                source: 'POLYMARKET',
                status: 'ACTIVE',
                resolutionDate: { lt: now },
            },
            data: {
                status: 'CLOSED',
                resolvedAt: now,
                resolutionSource: 'POLYMARKET',
            },
        });

        console.log(`[Reconcile] Done: ${closedEvents.count} events closed, ${Date.now() - start}ms`);
    } catch (err) {
        console.error('[Reconcile] Error:', err);
    }
}

/**
 * Check for resolved markets and trigger payouts
 * Runs every 10 minutes
 */
async function runResolutionSync(): Promise<void> {
    if (DRY_RUN) {
        console.log('[Resolution] Skipped (DRY_RUN)');
        return;
    }

    console.log('[Resolution] Starting...');
    const start = Date.now();
    let resolved = 0;

    try {
        // Get active mappings
        const mappings = await prisma.polymarketMarketMapping.findMany({
            where: { isActive: true },
        });

        if (!mappings.length) {
            console.log('[Resolution] No active mappings');
            return;
        }

        // Get events
        const eventIds = mappings.map((m: MappingRecord) => m.internalEventId).filter(Boolean);
        const events = await prisma.event.findMany({
            where: {
                id: { in: eventIds },
                status: { in: ['ACTIVE', 'CLOSED'] },
                source: 'POLYMARKET',
            },
            select: { id: true, title: true, status: true, type: true, liquidityParameter: true },
        });
        const eventById = new Map<string, EventInfo>(events.map((e: EventInfo) => [e.id, e]));

        // Fetch resolved events from Polymarket
        const response = await fetch(
            `${GAMMA_API_BASE}/events?closed=true&active=false&limit=100&order=endDate&ascending=false`,
            { cache: 'no-store', headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) {
            console.error('[Resolution] Gamma API error:', response.status);
            return;
        }

        const resolvedEvents: PolymarketEvent[] = await response.json();
        const resolvedMap = new Map(resolvedEvents.map(e => [e.id, e]));

        // Dynamic import of resolveMarket
        const { resolveMarket } = await import('./lib/resolve-market.js');

        for (const mapping of mappings) {
            const event = eventById.get(mapping.internalEventId);
            if (!event || event.status === 'RESOLVED') continue;

            let polyEvent = resolvedMap.get(mapping.polymarketId);

            // Fetch directly if not in batch
            if (!polyEvent) {
                try {
                    const r = await fetch(`${GAMMA_API_BASE}/events?id=${mapping.polymarketId}&limit=1`);
                    if (r.ok) {
                        const d = await r.json();
                        if (d?.[0]) polyEvent = d[0];
                    }
                } catch { }
            }

            if (!polyEvent || !polyEvent.closed || polyEvent.active) continue;

            const markets = parsePolyMarkets(polyEvent.markets);
            if (!markets.length) continue;

            let winningOutcomeId: string | null = null;
            let winningOutcomeName: string | null = null;

            if (event.type === 'MULTIPLE' || event.type === 'GROUPED_BINARY') {
                for (const market of markets) {
                    const winner = determineWinner(market);
                    if (winner?.toLowerCase() === 'yes') {
                        winningOutcomeName = market.groupItemTitle || market.slug || market.question || null;
                        break;
                    }
                }
                if (winningOutcomeName) {
                    const outcome = await prisma.outcome.findFirst({
                        where: { eventId: event.id, name: { contains: winningOutcomeName, mode: 'insensitive' } },
                        select: { id: true, name: true },
                    });
                    if (outcome) {
                        winningOutcomeId = outcome.id;
                        winningOutcomeName = outcome.name;
                    }
                }
            } else {
                const winner = determineWinner(markets[0]);
                if (winner) {
                    winningOutcomeId = winner.toUpperCase() === 'YES' ? 'YES' : 'NO';
                    winningOutcomeName = winningOutcomeId;
                }
            }

            if (!winningOutcomeId) continue;

            try {
                console.log(`[Resolution] Resolving ${event.title} -> ${winningOutcomeName}`);
                await resolveMarket(event.id, winningOutcomeId);

                await prisma.polymarketMarketMapping.update({
                    where: { id: mapping.id },
                    data: { isActive: false },
                });

                resolved++;
            } catch (err: any) {
                if (!err.message?.includes('already resolved')) {
                    console.error(`[Resolution] Failed ${event.title}:`, err.message);
                }
            }
        }

        console.log(`[Resolution] Done: ${resolved} resolved, ${Date.now() - start}ms`);
    } catch (err) {
        console.error('[Resolution] Error:', err);
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

    // Reconciliation every 5 minutes
    setInterval(runReconciliation, 5 * 60 * 1000);

    // Resolution sync every 10 minutes
    setInterval(runResolutionSync, 10 * 60 * 1000);

    // Run once on startup after a delay
    setTimeout(runReconciliation, 30_000);
    setTimeout(runResolutionSync, 60_000);

    // Heartbeat log
    setInterval(() => {
        console.log(`[Worker] Heartbeat: ${subscriptionTokenIds.length} subscriptions, ${lastPrices.size} cached prices`);
    }, HEARTBEAT_INTERVAL_MS);
}

main().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});

