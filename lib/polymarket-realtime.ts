/**
 * Polymarket Real-Time Data Client
 * 
 * Official wrapper around @polymarket/real-time-data-client for production use.
 * Handles trade feeds, price updates, and market data streams.
 * 
 * Topics available:
 * - "clob_market": Market data (price changes, orderbook, last trades) - PUBLIC
 * - "activity": Trade executions (type: "trades") - PUBLIC (requires slug)
 */

import { RealTimeDataClient, Message, ConnectionStatus } from '@polymarket/real-time-data-client';
import { prisma } from './prisma';
import { redis } from './redis';
import { getPusherServer } from './pusher-server';

export interface PolymarketRealtimeClientOptions {
    onPriceUpdate?: (tokenId: string, price: number) => Promise<void>;
    autoUpdateDb?: boolean;
}

// Circuit breaker states
enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN'
}

export class PolymarketRealtimeClient {
    private client: RealTimeDataClient | null = null;
    private options: PolymarketRealtimeClientOptions;
    private mappingCache: Map<string, any> = new Map();
    private activeTokenIds: Set<string> = new Set();

    // Circuit breaker
    private circuitState: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly FAILURE_THRESHOLD = 5;
    private readonly RESET_TIMEOUT = 60000;

    constructor(options: PolymarketRealtimeClientOptions = {}) {
        this.options = { autoUpdateDb: true, ...options };
    }

    public connect() {
        console.log('[Polymarket RTDS] Connecting to Polymarket data source (WebSocket)...');

        try {
            this.client = new RealTimeDataClient({
                onConnect: () => {
                    console.log('[Polymarket RTDS] ✅ WebSocket Connected!');
                    this.subscribeToActiveMarkets();
                },
                onMessage: (client, msg) => this.handleMessage(msg),
                onStatusChange: (status) => {
                    console.log(`[Polymarket RTDS] Connection status: ${status}`);
                }
            });

            this.client.connect();
        } catch (error: any) {
            console.error('[Polymarket RTDS] Failed to initialize WebSocket client:', error);
            this.handleFailure();
        }

        return this;
    }

    private handleFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.FAILURE_THRESHOLD) {
            this.circuitState = CircuitState.OPEN;
            console.error(`[Polymarket RTDS] ⚠️ CIRCUIT BREAKER OPEN - ${this.failureCount} failures`);
            console.error(`[Polymarket RTDS] Will auto-reconnect in ${this.RESET_TIMEOUT / 1000}s`);
            console.error('[Polymarket RTDS] 🚨 ALERT: Real-time odds updates are DOWN');
        }
    }

    private async handleMessage(message: Message) {
        try {
            // Debug log for sampling
            if (Math.random() < 0.01) {
                console.log(`[Polymarket RTDS] Msg: ${message.topic}/${message.type}`);
            }

            // Handle CLOB Market Last Trade Price
            if (message.topic === 'clob_market' && message.type === 'last_trade_price') {
                // Payload is an array of trade updates: [{ asset_id, price, size, ... }]
                const updates = message.payload as any[];

                if (Array.isArray(updates)) {
                    for (const update of updates) {
                        const assetId = update.asset_id;
                        const price = parseFloat(update.price);

                        if (assetId && !isNaN(price)) {
                            // Run in background to not block the WS loop
                            this.handleMarketUpdate(assetId, price).catch(err => {
                                console.error(`[Polymarket RTDS] Update error for ${assetId}:`, err);
                            });
                        }
                    }
                }
            }

            // Fallback: Handle Activity Trades (if we subscribe to them later)
            else if (message.topic === 'activity' && message.type === 'trade') {
                const payload = message.payload as any;
                const assetId = payload.asset;
                const price = parseFloat(payload.price);

                if (assetId && !isNaN(price)) {
                    await this.handleMarketUpdate(assetId, price);
                }
            }
        } catch (error: any) {
            console.error('[Polymarket RTDS] Error handling message:', error.message);
        }
    }

    private async handleMarketUpdate(asset_id: string, price: number) {
        try {
            if (this.options.onPriceUpdate) {
                await this.options.onPriceUpdate(asset_id, price);
            }

            if (!this.options.autoUpdateDb) return;

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
                if (mapping) this.mappingCache.set(asset_id, mapping);
            }

            if (!mapping || !mapping.event) return;

            const event = mapping.event;
            const isBinary = event.type === 'BINARY';

            let yesPrice: number | undefined;
            let noPrice: number | undefined;

            // 2. Update Main Tables
            if (isBinary && (mapping.yesTokenId === asset_id || mapping.noTokenId === asset_id)) {
                const isYes = mapping.yesTokenId === asset_id;
                yesPrice = isYes ? price : (1 - price);
                noPrice = 1 - yesPrice;

                await prisma.event.update({
                    where: { id: mapping.internalEventId },
                    data: { yesOdds: yesPrice, noOdds: noPrice },
                });
            } else {
                const outcome = event.outcomes?.find((o: any) => o.polymarketOutcomeId === asset_id);
                if (outcome) {
                    await prisma.outcome.update({
                        where: { id: outcome.id },
                        data: { probability: price },
                    });
                }
            }

            // 3. Track Odds History (5m buckets efficiency)
            // We throttle history writes to avoid spamming DB on every tick
            const historyKey = `history_last_write:${asset_id}`;
            const lastWrite = this.mappingCache.get(historyKey) || 0;
            const THROTTLE_MS = 60000; // Only write history max once per minute per token

            if (Date.now() - lastWrite > THROTTLE_MS) {
                const ODDS_HISTORY_BUCKET_MS = 5 * 60 * 1000;
                const bucketTs = Math.floor(Date.now() / ODDS_HISTORY_BUCKET_MS) * ODDS_HISTORY_BUCKET_MS;

                const targetOutcome = isBinary && (mapping.yesTokenId === asset_id || mapping.noTokenId === asset_id)
                    ? event.outcomes?.find((o: any) => o.name?.toUpperCase() === (mapping.yesTokenId === asset_id ? 'YES' : 'NO'))
                    : event.outcomes?.find((o: any) => o.polymarketOutcomeId === asset_id);

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
                    this.mappingCache.set(historyKey, Date.now());
                }
            }

            // 4. Real-time Broadcast (Pusher + Redis)
            const broadcastPayload = {
                eventId: event.id,
                assetId: asset_id,
                price,
                yesPrice,
                noPrice,
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
            } catch (err) {
                // Pusher might fail in some envs
            }

        } catch (error: any) {
            console.error('[Polymarket RTDS] Error handling update:', error.message);
        }
    }

    private async subscribeToActiveMarkets() {
        if (!this.client) return;

        try {
            const mappings = await prisma.polymarketMarketMapping.findMany({
                where: { isActive: true },
                include: { event: { select: { status: true, polymarketId: true } } }
            });

            const active = mappings.filter((m: any) => m.event?.status === 'ACTIVE');
            console.log(`[Polymarket RTDS] Found ${active.length} active markets`);

            // Collect all Token IDs to subscribe to
            const tokenIds: string[] = [];

            for (const map of active) {
                if (map.yesTokenId) tokenIds.push(map.yesTokenId);
                if (map.noTokenId) tokenIds.push(map.noTokenId);
            }

            this.activeTokenIds = new Set(tokenIds);

            if (tokenIds.length === 0) {
                console.log('[Polymarket RTDS] No active tokens to subscribe to.');
                return;
            }

            console.log(`[Polymarket RTDS] 🔌 Subscribing to ${tokenIds.length} tokens via WebSocket...`);

            // Subscribe to 'clob_market' -> 'last_trade_price'
            // This channel is PUBLIC and provides real-time price updates based on last trades
            this.client.subscribe({
                subscriptions: [{
                    topic: 'clob_market',
                    type: 'last_trade_price',
                    filters: tokenIds as any // Cast to any because library types incorrectly expect string
                }]
            });

            console.log('[Polymarket RTDS] 🚀 Subscription sent! Real-time updates active.');

        } catch (error: any) {
            console.error('[Polymarket RTDS] Failed to subscribe:', error.message);
        }
    }

    public disconnect() {
        if (this.client) {
            this.client.disconnect();
            this.client = null;
        }
    }
}

// Singleton instance
let globalRealtimeClient: PolymarketRealtimeClient | null = null;

export function getPolymarketRealtimeClient() {
    if (!globalRealtimeClient) {
        globalRealtimeClient = new PolymarketRealtimeClient();
    }
    return globalRealtimeClient;
}

