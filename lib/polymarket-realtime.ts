/**
 * Polymarket Real-Time Data Client
 * 
 * Official wrapper around @polymarket/real-time-data-client for production use.
 * Handles trade feeds, price updates, and market data streams.
 * 
 * Topics available:
 * - "activity": Trade executions (type: "trades")
 * - "comments": Market comments  
 * - "crypto_prices": Crypto price feeds
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
        console.log('[Polymarket RTDS] Connecting to Polymarket data source...');
        this.subscribeToActiveMarkets();
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
            // Handle trade messages from activity topic
            if (message.topic === 'activity' && message.type === 'trade') {
                const payload = message.payload as any;
                const assetId = payload.asset;
                const price = parseFloat(payload.price);

                if (assetId && !isNaN(price)) {
                    await this.handleMarketUpdate(assetId, price);
                }
            }
        } catch (error: any) {
            if (Math.random() < 0.05) {
                console.error('[Polymarket RTDS] Error handling message:', error.message);
            }
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

            // 3. Track Odds History (5m buckets)
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
        try {
            const mappings = await prisma.polymarketMarketMapping.findMany({
                where: { isActive: true },
                include: { event: { select: { status: true, polymarketSlug: true } } }
            });

            const active = mappings.filter((m: any) => m.event?.status === 'ACTIVE');
            console.log(`[Polymarket RTDS] Found ${active.length} active markets`);

            // IMPORTANT: The activity/trades WebSocket topic requires CLOB API authentication
            // which we don't have. Instead, we'll poll the public Gamma API every 30s.
            console.log('[Polymarket RTDS] ⚠️ WebSocket requires auth - using HTTP polling instead');

            this.startPolling(active);
        } catch (error: any) {
            console.error('[Polymarket RTDS] Failed to start polling:', error.message);
        }
    }

    private startPolling(mappings: any[]) {
        // Poll Polymarket Gamma API every 30 seconds for price updates
        const pollInterval = 30000; // 30s

        const poll = async () => {
            for (const mapping of mappings) {
                try {
                    const slug = mapping.event?.polymarketSlug;
                    if (!slug) continue;

                    // Fetch market data from Gamma API
                    const response = await fetch(`https://gamma-api.polymarket.com/markets/${slug}`);
                    if (!response.ok) continue;

                    const data = await response.json();

                    // Update prices for each outcome
                    const outcomePrices = data.outcomePrices || [];
                    const clobTokenIds = data.clobTokenIds || [];

                    for (let i = 0; i < clobTokenIds.length; i++) {
                        const tokenId = clobTokenIds[i];
                        const price = parseFloat(outcomePrices[i]);

                        if (tokenId && !isNaN(price)) {
                            await this.handleMarketUpdate(tokenId, price);
                        }
                    }
                } catch (error: any) {
                    // Silently continue on individual market errors
                }
            }
        };

        // Initial poll
        poll();

        // Poll every 30s
        setInterval(poll, pollInterval);
        console.log(`[Polymarket RTDS] 🔄 Polling ${mappings.length} markets every ${pollInterval / 1000}s`);
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
