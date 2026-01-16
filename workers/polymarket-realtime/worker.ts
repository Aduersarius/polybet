/**
 * Polymarket Real-Time Data Worker
 * 
 * Connects to Polymarket's WebSocket API using their official real-time-data-client
 * to receive live price updates and store them in the database.
 * 
 * This runs as a persistent container alongside the main app.
 */

import WebSocket from 'ws';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Redis from 'ioredis';
import Pusher from 'pusher';
import fs from 'fs';
import path from 'path';

interface PolymarketWSMessage {
    event_type: 'market' | 'book' | 'tick_size' | 'last_trade_price' | 'user';
    market?: string;
    asset_id?: string;
    hash?: string;
    data?: any;
    price?: string; // For last_trade_price events sometimes
}

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const ODDS_HISTORY_BUCKET_MS = 30 * 60 * 1000; // 30 minutes - consistent with historical backfill candles

// Price validation thresholds to prevent garbage data
const MAX_ALLOWED_SPREAD = 0.30; // 30% max bid/ask spread
const MAX_PRICE_DEVIATION = 0.25; // 25% max deviation from stored value

if (!DATABASE_URL) {
    console.error('[Worker] DATABASE_URL is required');
    process.exit(1);
}

// Initialize Prisma with pg adapter (Prisma 7 pattern)
const getSSLConfig = () => {
    try {
        const caPath = path.join(process.cwd(), 'certs/db-ca.crt');
        if (fs.existsSync(caPath)) {
            return {
                ca: fs.readFileSync(caPath, 'utf8'),
                rejectUnauthorized: true,
            };
        }
    } catch (err) {
        console.warn('[Worker] Failed to read CA certificate:', err);
    }
    return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : { rejectUnauthorized: false }; // nosemgrep
};

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: getSSLConfig(),
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
        // Use default TLS verification (true) for rediss:// connections
        tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
    });
    redis.on('error', (err) => console.error('[Redis] Error:', err.message));
}

// Initialize Pusher (Soketi) for real-time broadcasting
const pusher = new Pusher({
    appId: process.env.SOKETI_DEFAULT_APP_ID || 'pariflow',
    key: process.env.SOKETI_DEFAULT_APP_KEY || 'pariflow_key',
    secret: process.env.SOKETI_DEFAULT_APP_SECRET || 'pariflow_secret',
    host: process.env.SOKETI_HOST || 'soketi-z4kk8g8kggo4o4cgkc4kks8o', // Internal host if in same network
    port: process.env.SOKETI_PORT || '6001',
    useTLS: process.env.SOKETI_USE_TLS === 'true',
});

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
let spikeTracker: Map<string, { price: number, count: number }> = new Map(); // tokenId -> spike status
let subscriptionTokenIds: string[] = [];
let wsClient: WebSocket | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let stats = { messages: 0, updates: 0, errors: 0 };

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
    let currentProbability: number | undefined;

    // For binary events, map YES/NO based on token ID
    if (mapping.eventType === 'BINARY') {
        const isYes = tokenId === mapping.yesTokenId;
        const outcomeMatch = await prisma.outcome.findFirst({
            where: {
                eventId,
                name: { in: isYes ? ['YES', 'Yes', 'yes'] : ['NO', 'No', 'no'] },
            },
            select: { id: true, probability: true },
        });
        outcomeId = outcomeMatch?.id || null;
        currentProbability = outcomeMatch?.probability;
    } else {
        // For MULTIPLE, find by polymarketOutcomeId
        const outcomeMatch = await prisma.outcome.findFirst({
            where: {
                eventId,
                polymarketOutcomeId: tokenId,
            },
            select: { id: true, probability: true },
        });
        outcomeId = outcomeMatch?.id || null;
        currentProbability = outcomeMatch?.probability;
    }

    if (!outcomeId) {
        console.warn(`[Worker] No outcome found for event ${eventId}, token ${tokenId}`);
        return;
    }

    // SPIKE DETECTION: Reject updates that deviate too much from current stored value
    // This prevents garbage data from oscillating YES/NO inversions and thin orderbooks
    if (currentProbability !== undefined && currentProbability > 0) {
        const deviation = Math.abs(probability - currentProbability);
        if (deviation > MAX_PRICE_DEVIATION) {
            // Track if this "spike" is actually a sustained move
            const tracker = spikeTracker.get(tokenId);
            const isSustained = tracker && Math.abs(tracker.price - probability) < 0.05;
            const count = isSustained ? (tracker.count + 1) : 1;

            spikeTracker.set(tokenId, { price: probability, count });

            // If we've seen this price 3 times, allow it (sustained move)
            if (count >= 3) {
                console.log(`[Worker] ✅ ACCEPTING SUSTAINED MOVE for ${eventId} (${tokenId}): ${(probability * 100).toFixed(1)}% (was ${(currentProbability * 100).toFixed(1)}%)`);
                spikeTracker.delete(tokenId);
                // Continue to update
            } else {
                console.warn(`[Worker] ⚠️ REJECTED SPIKE for ${eventId} (${tokenId}): ${(currentProbability * 100).toFixed(1)}% → ${(probability * 100).toFixed(1)}% (gap ${(deviation * 100).toFixed(1)}% > ${MAX_PRICE_DEVIATION * 100}%) [Sustained count: ${count}]`);
                return;
            }
        } else {
            // Price is normal, clear any pending spike tracking
            spikeTracker.delete(tokenId);
        }
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

    // Broadcast update via Redis & Soketi
    if (redis) {
        try {
            // 1. Broad sports-odds update (legacy/targeted)
            await redis.publish('sports-odds', JSON.stringify({
                eventId,
                outcomeId,
                probability,
                price,
                timestamp: Date.now(),
            }));

            // 2. Targeted event-updates for hot ingestion in UI (EventCards, TradingPanels)
            const eventPayload: any = {
                eventId,
                timestamp: Date.now(),
            };

            if (mapping.eventType === 'BINARY') {
                const isYes = tokenId === mapping.yesTokenId;
                const oppositeTokenId = isYes ? mapping.noTokenId : mapping.yesTokenId;
                const oppositePrice = oppositeTokenId ? (lastPrices.get(oppositeTokenId) ?? (1 - price)) : (1 - price);

                eventPayload.yesPrice = isYes ? price : oppositePrice;
                eventPayload.noPrice = isYes ? oppositePrice : price;
            } else {
                // For Multiple/Grouped, we can send the updated outcomes list
                eventPayload.outcomes = mapping.outcomeMapping.map(oc => {
                    const ocPrice = oc.polymarketId === tokenId ? price : (lastPrices.get(oc.polymarketId) || 0);
                    return {
                        id: oc.internalId,
                        probability: ocPrice,
                    };
                });
            }

            // Publish via Redis for legacy/internal consumers
            await redis.publish('event-updates', JSON.stringify(eventPayload));

            // Publish via Pusher (Soketi) for Frontend Targeted Event
            await pusher.trigger(`event-${eventId}`, 'odds-update', eventPayload);

            // Publish via Pusher (Soketi) for Sports List View
            // Mapping to expected format { events: [ { id, yesOdds, ... } ] }
            await pusher.trigger('sports-odds', 'sports:odds-update', {
                count: 1,
                timestamp: new Date().toISOString(),
                events: [{
                    id: eventId,
                    yesOdds: eventPayload.yesPrice,
                    noOdds: eventPayload.noPrice,
                    outcomes: eventPayload.outcomes,
                }]
            });
        } catch (err) {
            console.error('[Worker] Broadcast error:', err);
        }
    }
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(rawData: WebSocket.Data): Promise<void> {
    stats.messages++;
    try {
        const message = JSON.parse(rawData.toString()) as PolymarketWSMessage;

        if (DRY_RUN) {
            // console.log(`[DRY_RUN] Message:`, JSON.stringify(message).slice(0, 100));
        }

        // Handle 'market' event (contains data object with price/bids)
        // OR 'last_trade_price' event (contains direct price)
        let assetId: string | undefined;
        let priceNum: number | undefined;

        if (message.event_type === 'market' && message.data) {
            assetId = message.asset_id;
            // Use mid price if available (best_bid/best_ask), else price
            const data = message.data;
            if (data.best_bid && data.best_ask) {
                const bid = parseFloat(data.best_bid);
                const ask = parseFloat(data.best_ask);
                const spread = ask - bid;

                // SPREAD VALIDATION
                if (spread <= MAX_ALLOWED_SPREAD) {
                    priceNum = (bid + ask) / 2;

                    // Cache liquidity
                    if (redis) {
                        // Cache liquidity snapshot
                        const liquiditySnapshot = {
                            tokenId: assetId,
                            bestBid: bid,
                            bestAsk: ask,
                            midPrice: priceNum,
                            spread: spread,
                            timestamp: Date.now(),
                        };
                        redis.set(`liquidity:${assetId}`, JSON.stringify(liquiditySnapshot), 'EX', 30).catch(() => { });
                    }
                }
            }

            if (priceNum === undefined && data.price) {
                priceNum = parseFloat(data.price);
            }

        } else if (message.event_type === 'last_trade_price') {
            assetId = message.asset_id;
            if (message.price) {
                priceNum = parseFloat(message.price);
            }
        }

        if (!assetId || priceNum === undefined || !Number.isFinite(priceNum)) return;

        // Update cache
        lastPrices.set(assetId, priceNum);

        // Find mapping
        const mapping = marketMappings.get(assetId);
        if (!mapping) return;

        await updateOutcomeProbability(mapping.internalEventId, assetId, priceNum, mapping);
        stats.updates++;
        // console.log(`[Worker] Updated ${assetId}: ${(priceNum * 100).toFixed(1)}%`);

    } catch (err) {
        console.error('[Worker] Error handling message:', err);
    }
}

/**
 * Connect to Polymarket WebSocket and subscribe to markets
 */
/**
 * Connect to Polymarket WebSocket and subscribe to markets
 * Using native ws client to ws-subscriptions-clob.polymarket.com
 */
function connect(): void {
    console.log('[Worker] Connecting to Polymarket WebSocket...');

    try {
        wsClient = new WebSocket('wss://ws-live-data.polymarket.com/');

        wsClient.on('open', () => {
            console.log('[Worker] Connected! Subscribing to markets...');

            // Start heartbeat
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                    wsClient.ping();
                }
            }, HEARTBEAT_INTERVAL_MS);

            // Send subscriptions
            if (subscriptionTokenIds.length > 0) {
                subscriptionTokenIds.forEach(id => subscribeToToken(id));
                console.log(`[Worker] Sent subscriptions for ${subscriptionTokenIds.length} tokens`);
            }
        });

        wsClient.on('message', (data: WebSocket.Data) => {
            handleMessage(data);
        });

        wsClient.on('error', (err) => {
            console.error('[Worker] WS Error:', err.message);
        });

        wsClient.on('close', () => {
            console.log('[Worker] WS Disconnected. Reconnecting in 5s...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            wsClient = null;
            setTimeout(connect, 5000);
        });

    } catch (err) {
        console.error('[Worker] Connect failed:', err);
        setTimeout(connect, 5000);
    }
}

function subscribeToToken(assetId: string) {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
            type: 'subscribe',
            channel: 'market',
            asset_id: assetId
        }));
    }
}

function unsubscribeFromToken(assetId: string) {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
            type: 'unsubscribe',
            channel: 'market',
            asset_id: assetId
        }));
    }
}

/**
 * Refresh mappings periodically to pick up new events
 */
async function refreshMappings(): Promise<void> {
    try {
        const oldIds = new Set(subscriptionTokenIds);
        await loadMappings();
        const newIds = new Set(subscriptionTokenIds);

        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            // Unsubscribe removed
            for (const id of oldIds) {
                if (!newIds.has(id)) {
                    unsubscribeFromToken(id);
                }
            }
            // Subscribe new
            let added = 0;
            for (const id of newIds) {
                if (!oldIds.has(id)) {
                    subscribeToToken(id);
                    added++;
                }
            }
            if (added > 0) {
                console.log(`[Worker] Subscribed to ${added} new tokens`);
            }
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


// ============================================
// BACKFILL QUEUE & SYNC LOGIC
// ============================================

interface BackfillJob {
    id: string;
    eventId: string;
    outcomeId: string;
    tokenId: string;
    marketId?: string;
    polymarketStartDate?: string;
    probability?: number;
    queuedAt: number;
    attempts: number;
}

const BACKFILL_QUEUE_KEY = 'backfill:jobs';
const BACKFILL_PROCESSING_KEY = 'backfill:processing';
const BACKFILL_DEAD_LETTER_KEY = 'backfill:dead-letter';
const BACKFILL_MAX_ATTEMPTS = 3;
const POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';

/**
 * Get next backfill job from queue
 */
async function getNextBackfillJob(): Promise<BackfillJob | null> {
    if (!redis) return null;
    try {
        const jobStr = await redis.rpoplpush(BACKFILL_QUEUE_KEY, BACKFILL_PROCESSING_KEY);
        if (!jobStr) return null;

        const job = JSON.parse(jobStr) as BackfillJob;
        job.attempts++;

        await redis.lrem(BACKFILL_PROCESSING_KEY, 1, jobStr);
        await redis.lpush(BACKFILL_PROCESSING_KEY, JSON.stringify(job));

        return job;
    } catch (err) {
        console.error('[Backfill] Failed to get next job:', err);
        return null;
    }
}

async function completeBackfillJob(job: BackfillJob): Promise<void> {
    if (!redis) return;
    await redis.lrem(BACKFILL_PROCESSING_KEY, 1, JSON.stringify(job));
    console.log(`[Backfill] ✅ Completed: ${job.eventId}/${job.outcomeId}`);
}

async function failBackfillJob(job: BackfillJob, error: Error): Promise<void> {
    if (!redis) return;
    await redis.lrem(BACKFILL_PROCESSING_KEY, 1, JSON.stringify(job));

    if (job.attempts >= BACKFILL_MAX_ATTEMPTS) {
        await redis.lpush(BACKFILL_DEAD_LETTER_KEY, JSON.stringify({
            ...job,
            error: error.message,
            failedAt: Date.now(),
        }));
        console.warn(`[Backfill] ❌ Dead letter: ${job.id}`);
    } else {
        await redis.lpush(BACKFILL_QUEUE_KEY, JSON.stringify(job));
        console.log(`[Backfill] Retry ${job.attempts}/${BACKFILL_MAX_ATTEMPTS}: ${job.id}`);
    }
}

function normalizeProbability(raw: any): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    if (n > 1 && n <= 100) return clamp01(n / 100);
    return clamp01(n);
}

async function processBackfillJob(job: BackfillJob): Promise<void> {
    console.log(`[Backfill] Processing: ${job.eventId}/${job.outcomeId}`);

    const endSec = Math.floor(Date.now() / 1000);
    // Default lookback: 1 year or since PM start date
    let startSec = endSec - 365 * 24 * 60 * 60;

    if (job.polymarketStartDate) {
        const polyDate = new Date(job.polymarketStartDate);
        if (!isNaN(polyDate.getTime())) {
            startSec = Math.max(startSec, Math.floor(polyDate.getTime() / 1000));
        }
    }

    const historyUrl = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(job.tokenId)}&interval=max&fidelity=30`;
    const resp = await fetch(historyUrl, { cache: 'no-store' });

    if (!resp.ok) {
        throw new Error(`Polymarket API: ${resp.status}`);
    }

    const data = await resp.json();
    const history = Array.isArray(data?.history) ? data.history
        : Array.isArray(data?.prices) ? data.prices
            : Array.isArray(data) ? data : [];

    if (history.length === 0) {
        console.log(`[Backfill] No history for ${job.tokenId}`);
        return;
    }

    const bucketedMap = new Map<number, any>();
    const BUCKET_MS = ODDS_HISTORY_BUCKET_MS;

    for (const p of history) {
        const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
        if (!Number.isFinite(tsRaw)) continue;

        const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
        const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;

        if (tsSec < startSec || tsSec > endSec) continue;

        const bucketTs = Math.floor(tsMs / BUCKET_MS) * BUCKET_MS;
        const priceRaw = p.price ?? p.probability ?? p.p ?? p.value;
        if (priceRaw == null) continue;

        const prob = normalizeProbability(priceRaw);
        bucketedMap.set(bucketTs, {
            eventId: job.eventId,
            outcomeId: job.outcomeId,
            polymarketTokenId: job.tokenId,
            timestampMs: bucketTs,
            price: Number(priceRaw),
            probability: prob,
        });
    }

    const rows = Array.from(bucketedMap.values());
    if (rows.length === 0) return;

    // Batch insert using Prisma createMany
    const insertData = rows.map(r => ({
        eventId: r.eventId,
        outcomeId: r.outcomeId,
        polymarketTokenId: r.polymarketTokenId,
        timestamp: new Date(r.timestampMs),
        price: r.price,
        probability: r.probability,
        source: 'POLYMARKET',
    }));

    // Chunk formatting is handled by Prisma, but let's do safe batching (1000 items)
    for (let i = 0; i < insertData.length; i += 1000) {
        const chunk = insertData.slice(i, i + 1000);
        await prisma.oddsHistory.createMany({
            data: chunk,
            skipDuplicates: true,
        });
    }

    console.log(`[Backfill] Inserted ${rows.length} rows for ${job.eventId}/${job.outcomeId}`);

    // Update outcome with latest prob
    const latestRow = rows[rows.length - 1];
    if (latestRow) {
        await prisma.outcome.update({
            where: { id: job.outcomeId },
            data: { probability: latestRow.probability },
        });
    }
}

/**
 * Recover stuck backfill jobs
 */
async function recoverStuckBackfillJobs(): Promise<void> {
    if (!redis) return;
    let recovered = 0;
    let jobStr: string | null;
    while ((jobStr = await redis.rpop(BACKFILL_PROCESSING_KEY))) {
        await redis.lpush(BACKFILL_QUEUE_KEY, jobStr);
        recovered++;
    }
    if (recovered > 0) {
        console.log(`[Backfill] Recovered ${recovered} stuck jobs`);
    }
}

/**
 * Continuous loop to process backfill jobs
 */
async function runBackfillLoop(): Promise<void> {
    console.log('[Backfill] Starting processor loop...');
    if (!redis) {
        console.warn('[Backfill] Redis missing, loop disabled');
        return;
    }

    while (true) {
        try {
            const job = await getNextBackfillJob();
            if (job) {
                try {
                    await processBackfillJob(job);
                    await completeBackfillJob(job);
                } catch (err) {
                    await failBackfillJob(job, err as Error);
                }
            }
            // If job found, poll fast (100ms), else slow (5s)
            await new Promise(r => setTimeout(r, job ? 100 : 5000));
        } catch (err) {
            console.error('[Backfill] Loop error:', err);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}


/**
 * Periodic OddsHistory Sync
 * Appends current prices to OddsHistory every 30 minutes
 */
async function fetchLivePrice(tokenId: string): Promise<number | undefined> {
    try {
        const url = `${POLYMARKET_CLOB_API_URL}/book?token_id=${encodeURIComponent(tokenId)}`;
        const resp = await fetch(url, { cache: 'no-store' });

        if (!resp.ok) return undefined;

        const data = await resp.json();
        const bids = data?.bids || [];
        const asks = data?.asks || [];

        if (bids.length === 0 && asks.length === 0) return undefined;

        const bestBid = bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : undefined;
        const bestAsk = asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : undefined;

        if (bestBid !== undefined && bestAsk !== undefined) {
            return (bestBid + bestAsk) / 2;
        }
        return bestBid ?? bestAsk;
    } catch {
        return undefined;
    }
}

async function syncOddsHistory(): Promise<void> {
    if (DRY_RUN) {
        console.log('[Sync] Skipped (DRY_RUN)');
        return;
    }

    console.log('[Sync] Starting periodic odds sync...');
    const start = Date.now();

    try {
        // Get active mappings with tokens
        const mappings = await prisma.polymarketMarketMapping.findMany({
            where: {
                isActive: true,
                OR: [
                    { yesTokenId: { not: null } },
                    { noTokenId: { not: null } },
                    // Check outcomeMapping existence via raw query would be better but Prisma is limited
                    // We'll filter in JS for now since we load all active mappings anyway
                ],
            },
            // @ts-ignore
            include: {
                event: {
                    include: {
                        outcomes: true,
                    }
                }
            }
        });

        const activeMappings = mappings.filter((m: any) => m.event?.status === 'ACTIVE');
        console.log(`[Sync] Found ${activeMappings.length} active events to sync`);

        const bucketTs = Math.floor(Date.now() / ODDS_HISTORY_BUCKET_MS) * ODDS_HISTORY_BUCKET_MS;
        const historyRows: any[] = [];
        let fetched = 0;

        for (const mapping of activeMappings) {
            const event = mapping.event as any;
            if (!event) continue;

            // Collect tokens to fetch
            const tokensToFetch: Array<{ tokenId: string, outcomeId: string }> = [];

            if (event.type === 'BINARY') {
                if (mapping.yesTokenId) {
                    const yesOutcome = event.outcomes.find((o: any) => o.name.toUpperCase() === 'YES');
                    if (yesOutcome) tokensToFetch.push({ tokenId: mapping.yesTokenId, outcomeId: yesOutcome.id });
                }
            } else {
                for (const o of event.outcomes) {
                    if (o.polymarketOutcomeId) {
                        tokensToFetch.push({ tokenId: o.polymarketOutcomeId, outcomeId: o.id });
                    }
                }
            }

            for (const item of tokensToFetch) {
                // Rate limit
                await new Promise(r => setTimeout(r, 50));

                const price = await fetchLivePrice(item.tokenId);
                if (price !== undefined) {
                    const prob = clamp01(price);
                    historyRows.push({
                        eventId: event.id,
                        outcomeId: item.outcomeId,
                        polymarketTokenId: item.tokenId,
                        timestamp: new Date(bucketTs),
                        price: price,
                        probability: prob,
                        source: 'POLYMARKET',
                    });
                    fetched++;

                    // Also update current probability
                    await prisma.outcome.update({
                        where: { id: item.outcomeId },
                        data: { probability: prob },
                    });
                }
            }
        }

        // Buffer insert
        if (historyRows.length > 0) {
            await prisma.oddsHistory.createMany({
                data: historyRows,
                skipDuplicates: true,
            });
        }

        console.log(`[Sync] Done: ${fetched} prices synced in ${Date.now() - start}ms`);
    } catch (err) {
        console.error('[Sync] Error:', err);
    }
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
 * Aggressive Hedge Reconciliation
 * Runs every 1 minute to fix stuck hedge positions
 * 
 * Finds pending hedges older than 2 minutes and either:
 * - Confirms they completed (update to 'hedged')
 * - Marks them as failed if no Polymarket order exists
 */
async function runHedgeReconciliation(): Promise<void> {
    if (DRY_RUN) {
        console.log('[HedgeReconcile] Skipped (DRY_RUN)');
        return;
    }

    console.log('[HedgeReconcile] Starting...');
    const start = Date.now();

    try {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

        // Find stuck pending hedges older than 2 minutes
        const stuckHedges = await prisma.hedgePosition.findMany({
            where: {
                status: 'pending',
                createdAt: { lt: twoMinutesAgo },
            },
            take: 50,
        });

        if (stuckHedges.length === 0) {
            console.log(`[HedgeReconcile] No stuck hedges found, ${Date.now() - start}ms`);
            return;
        }

        console.log(`[HedgeReconcile] Found ${stuckHedges.length} stuck pending hedges`);

        let fixed = 0;
        let failed = 0;

        for (const hedge of stuckHedges) {
            try {
                if (hedge.polymarketOrderId) {
                    // Has Polymarket order ID - assume it succeeded
                    // In production with API keys, we could verify with polymarketTrading.getOrderStatus
                    console.log(`[HedgeReconcile] Marking ${hedge.id} as hedged (has order ID)`);
                    await prisma.hedgePosition.update({
                        where: { id: hedge.id },
                        data: {
                            status: 'hedged',
                            hedgedAt: new Date(),
                            metadata: {
                                ...(hedge.metadata as object || {}),
                                reconciledAt: new Date().toISOString(),
                                reconciledReason: 'Stuck pending with Polymarket order ID',
                            },
                        },
                    });
                    fixed++;
                } else {
                    // No Polymarket order ID - mark as failed
                    console.log(`[HedgeReconcile] Marking ${hedge.id} as failed (no order ID)`);
                    await prisma.hedgePosition.update({
                        where: { id: hedge.id },
                        data: {
                            status: 'failed',
                            failureReason: 'Reconciled: No Polymarket order placed within timeout',
                            metadata: {
                                ...(hedge.metadata as object || {}),
                                reconciledAt: new Date().toISOString(),
                                reconciledReason: 'No Polymarket order ID after 2 minutes',
                            },
                        },
                    });
                    failed++;
                }
            } catch (updateErr) {
                console.error('[HedgeReconcile] Failed to update', hedge.id, ':', updateErr);
            }
        }

        console.log('[HedgeReconcile] Done:', fixed, 'fixed,', failed, 'failed,', Date.now() - start, 'ms');
    } catch (err) {
        console.error('[HedgeReconcile] Error:', err);
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
                console.log('[Resolution] Resolving', event.title, '->', winningOutcomeName);
                await resolveMarket(event.id, winningOutcomeId);

                await prisma.polymarketMarketMapping.update({
                    where: { id: mapping.id },
                    data: { isActive: false },
                });

                resolved++;
            } catch (err: any) {
                if (!err.message?.includes('already resolved')) {
                    console.error('[Resolution] Failed', event.title, ':', err.message);
                }
            }
        }

        console.log('[Resolution] Done:', resolved, 'resolved,', Date.now() - start, 'ms');
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
        wsClient.close();
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

    // Start backfill consumer loop (non-blocking)
    runBackfillLoop().catch(err => console.error('[Backfill] Loop crashed:', err));

    // Refresh mappings every 5 minutes
    setInterval(refreshMappings, 5 * 60 * 1000);

    // Reconciliation every 5 minutes
    setInterval(runReconciliation, 5 * 60 * 1000);

    // Resolution sync every 10 minutes
    setInterval(runResolutionSync, 10 * 60 * 1000);

    // Aggressive hedge reconciliation every 1 minute
    setInterval(runHedgeReconciliation, 1 * 60 * 1000);

    // Periodic OddsHistory Sync every 30 minutes
    setInterval(syncOddsHistory, 30 * 60 * 1000);

    // Run once on startup after a delay
    setTimeout(runReconciliation, 30_000);
    setTimeout(runResolutionSync, 60_000);
    setTimeout(runHedgeReconciliation, 45_000); // Stagger with other jobs
    setTimeout(recoverStuckBackfillJobs, 10_000); // Recover stuck jobs shortly after start


    // Heartbeat log
    setInterval(() => {
        console.log('[Worker] Heartbeat:', subscriptionTokenIds.length, 'subscriptions,', lastPrices.size, 'cached prices. Last 30s:', stats.messages, 'msgs,', stats.updates, 'updates,', stats.errors, 'errors');
        // Reset stats
        stats = { messages: 0, updates: 0, errors: 0 };
    }, HEARTBEAT_INTERVAL_MS);
}

main().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});

