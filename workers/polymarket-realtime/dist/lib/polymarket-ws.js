/**
 * Polymarket WebSocket Client
 * Real-time updates for sports events, markets, and odds
 *
 * Performance Optimized: Uses internal caching to avoid DB lookups on every message.
 * Integrated: Directly broadcasts to Pusher (Soketi) for instant UI updates.
 */
import WebSocket from 'ws';
import { prisma } from './prisma';
import { redis } from './redis';
import { getPusherServer } from './pusher-server';
export class PolymarketWebSocketClient {
    ws = null;
    reconnectTimeout = null;
    reconnectAttempts = 0;
    maxReconnectAttempts = 20;
    subscribedMarkets = new Set();
    isConnected = false;
    heartbeatInterval = null;
    options;
    // Performance cache: asset_id -> Mapping with Event & Outcomes
    mappingCache = new Map();
    constructor(options = {}) {
        this.options = { autoUpdateDb: true, ...options };
        this.connect();
        this.setupDynamicSubscription();
    }
    connect() {
        try {
            console.log('[Polymarket WS] Connecting... 🔌');
            this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com');
            this.ws.on('open', () => {
                console.log('[Polymarket WS] ✅ Connected!');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.resubscribeToMarkets();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            this.ws.on('error', (error) => {
                console.error('[Polymarket WS] Error:', error.message);
            });
            this.ws.on('close', () => {
                console.log('[Polymarket WS] 🔌 Disconnected');
                this.isConnected = false;
                this.stopHeartbeat();
                this.attemptReconnect();
            });
        }
        catch (error) {
            console.error('[Polymarket WS] Failed to connect:', error);
            this.attemptReconnect();
        }
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.isConnected)
                this.ws.ping();
        }, 30000);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[Polymarket WS] Max reconnect attempts reached');
            return;
        }
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
    async handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            if (message.event_type === 'last_trade_price' && message.asset_id && message.data) {
                const price = parseFloat(message.data);
                if (!isNaN(price)) {
                    await this.handleMarketUpdate(message.asset_id, price);
                }
            }
        }
        catch (error) { }
    }
    /**
     * Main handler for real-time market updates
     */
    async handleMarketUpdate(asset_id, price) {
        try {
            if (this.options.onPriceUpdate) {
                await this.options.onPriceUpdate(asset_id, price);
            }
            if (!this.options.autoUpdateDb)
                return;
            // 1. Efficient Mapping Resolution
            let mapping = this.mappingCache.get(asset_id);
            if (!mapping) {
                mapping = await prisma.polymarketMarketMapping.findFirst({
                    where: {
                        OR: [
                            { yesTokenId: asset_id },
                            { noTokenId: asset_id },
                            { outcomeMapping: { path: ['outcomes'], array_contains: { polymarketId: asset_id } } }
                        ],
                    },
                    include: { event: { include: { outcomes: true } } },
                });
                if (mapping)
                    this.mappingCache.set(asset_id, mapping);
            }
            if (!mapping || !mapping.event)
                return;
            const event = mapping.event;
            const isBinary = event.type === 'BINARY';
            let yesPrice;
            let noPrice;
            // 2. Update Main Tables
            if (isBinary && (mapping.yesTokenId === asset_id || mapping.noTokenId === asset_id)) {
                const isYes = mapping.yesTokenId === asset_id;
                yesPrice = isYes ? price : (1 - price);
                noPrice = 1 - yesPrice;
                await prisma.event.update({
                    where: { id: mapping.internalEventId },
                    data: { yesOdds: yesPrice, noOdds: noPrice },
                });
            }
            else {
                const outcome = event.outcomes?.find((o) => o.polymarketOutcomeId === asset_id);
                if (outcome) {
                    await prisma.outcome.update({
                        where: { id: outcome.id },
                        data: { probability: price },
                    });
                }
            }
            // 3. Track Odds History (5m buckets)
            const ODDS_HISTORY_BUCKET_MS = 5 * 60 * 1000;
            const bucketTs = Math.floor(Date.now() / ODDS_HISTORY_BUCKET_MS) * ODDS_HISTORY_BUCKET_MS;
            const targetOutcome = isBinary && (mapping.yesTokenId === asset_id || mapping.noTokenId === asset_id)
                ? event.outcomes?.find((o) => o.name?.toUpperCase() === (mapping.yesTokenId === asset_id ? 'YES' : 'NO'))
                : event.outcomes?.find((o) => o.polymarketOutcomeId === asset_id);
            if (targetOutcome) {
                await prisma.oddsHistory.upsert({
                    where: {
                        eventId_outcomeId_timestamp: {
                            eventId: event.id,
                            outcomeId: targetOutcome.id,
                            timestamp: new Date(bucketTs),
                        },
                    },
                    update: { price, probability: price },
                    create: {
                        eventId: event.id,
                        outcomeId: targetOutcome.id,
                        timestamp: new Date(bucketTs),
                        price,
                        probability: price,
                        polymarketTokenId: asset_id,
                        source: 'POLYMARKET',
                    },
                });
            }
            // 4. Real-time Broadcast (Pusher + Redis)
            const broadcastPayload = {
                eventId: event.id,
                assetId: asset_id,
                price,
                yesPrice: yesPrice,
                noPrice: noPrice,
                timestamp: Date.now()
            };
            // A. Redis (Internal)
            if (redis) {
                await redis.publish(`event-updates:${event.id}`, JSON.stringify(broadcastPayload));
            }
            // B. Pusher (Frontend / Soketi)
            try {
                const pusher = getPusherServer();
                await pusher.trigger(`event-${event.id}`, 'odds-update', broadcastPayload);
            }
            catch (err) {
                // Pusher might fail in some envs
            }
        }
        catch (error) {
            console.error('[Polymarket WS] Error handling update:', error.message);
        }
    }
    subscribe(assetId) {
        if (!this.ws || !this.isConnected) {
            this.subscribedMarkets.add(assetId);
            return;
        }
        this.ws.send(JSON.stringify({ type: 'subscribe', event_type: 'last_trade_price', asset_id: assetId }));
        this.subscribedMarkets.add(assetId);
    }
    resubscribeToMarkets() {
        const markets = Array.from(this.subscribedMarkets);
        this.subscribedMarkets.clear();
        for (const m of markets)
            this.subscribe(m);
    }
    async subscribeToAllActiveEvents() {
        try {
            const mappings = await prisma.polymarketMarketMapping.findMany({
                where: { isActive: true },
                include: { event: { select: { status: true } } }
            });
            const active = mappings.filter((m) => m.event?.status === 'ACTIVE');
            console.log(`[Polymarket WS] Subscribing to ${active.length} active mappings...`);
            for (const mapping of active) {
                if (mapping.yesTokenId)
                    this.subscribe(mapping.yesTokenId);
                if (mapping.noTokenId)
                    this.subscribe(mapping.noTokenId);
                const outcomes = mapping.outcomeMapping?.outcomes;
                if (Array.isArray(outcomes)) {
                    outcomes.forEach((o) => { if (o.polymarketId)
                        this.subscribe(o.polymarketId); });
                }
            }
        }
        catch (error) {
            console.error('[Polymarket WS] Failed to subscribe to active events:', error);
        }
    }
    /**
     * Alias for backwards compatibility
     */
    async subscribeToAllSportsEvents() {
        return this.subscribeToAllActiveEvents();
    }
    async setupDynamicSubscription() {
        if (!redis)
            return;
        const { Redis } = await import('ioredis');
        const sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            tls: process.env.REDIS_URL?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
        });
        await sub.subscribe('polymarket:new-market');
        sub.on('message', async () => {
            await this.subscribeToAllActiveEvents();
        });
    }
}
// Singleton instance for app-wide use
let globalWsClient = null;
export function getPolymarketWSClient() {
    if (!globalWsClient) {
        globalWsClient = new PolymarketWebSocketClient();
    }
    return globalWsClient;
}
