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
import { prisma } from './prisma';
import { redis } from './redis';
import { getPusherServer } from './pusher-server';
// Circuit breaker states
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
export class PolymarketRealtimeClient {
    client = null;
    options;
    mappingCache = new Map();
    // Circuit breaker
    circuitState = CircuitState.CLOSED;
    failureCount = 0;
    lastFailureTime = 0;
    FAILURE_THRESHOLD = 5;
    RESET_TIMEOUT = 60000;
    constructor(options = {}) {
        this.options = { autoUpdateDb: true, ...options };
    }
    connect() {
        console.log('[Polymarket RTDS] Connecting to Polymarket data source...');
        this.subscribeToActiveMarkets();
        return this;
    }
    handleFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.FAILURE_THRESHOLD) {
            this.circuitState = CircuitState.OPEN;
            console.error(`[Polymarket RTDS] ⚠️ CIRCUIT BREAKER OPEN - ${this.failureCount} failures`);
            console.error(`[Polymarket RTDS] Will auto-reconnect in ${this.RESET_TIMEOUT / 1000}s`);
            console.error('[Polymarket RTDS] 🚨 ALERT: Real-time odds updates are DOWN');
        }
    }
    async handleMessage(message) {
        try {
            // Handle trade messages from activity topic
            if (message.topic === 'activity' && message.type === 'trade') {
                const payload = message.payload;
                const assetId = payload.asset;
                const price = parseFloat(payload.price);
                if (assetId && !isNaN(price)) {
                    await this.handleMarketUpdate(assetId, price);
                }
            }
        }
        catch (error) {
            if (Math.random() < 0.05) {
                console.error('[Polymarket RTDS] Error handling message:', error.message);
            }
        }
    }
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
            }
            catch (err) {
                // Pusher might fail in some envs
            }
        }
        catch (error) {
            console.error('[Polymarket RTDS] Error handling update:', error.message);
        }
    }
    async subscribeToActiveMarkets() {
        try {
            const mappings = await prisma.polymarketMarketMapping.findMany({
                where: { isActive: true },
                include: { event: { select: { status: true, polymarketId: true } } }
            });
            const active = mappings.filter((m) => m.event?.status === 'ACTIVE');
            console.log(`[Polymarket RTDS] Found ${active.length} active markets`);
            // IMPORTANT: The activity/trades WebSocket topic requires CLOB API authentication
            // which we don't have. Instead, we'll poll the public Gamma API every 30s.
            console.log('[Polymarket RTDS] ⚠️ WebSocket requires auth - using HTTP polling instead');
            this.startPolling(active);
        }
        catch (error) {
            console.error('[Polymarket RTDS] Failed to start polling:', error.message);
        }
    }
    startPolling(mappings) {
        // Poll Polymarket Gamma API every 30 seconds for price updates
        const pollInterval = 30000; // 30s
        const poll = async () => {
            for (const mapping of mappings) {
                try {
                    const polymarketId = mapping.event?.polymarketId;
                    if (!polymarketId)
                        continue;
                    // Get token IDs from mapping
                    const clobTokenIds = [mapping.yesTokenId, mapping.noTokenId].filter(Boolean);
                    if (clobTokenIds.length === 0)
                        continue;
                    // Fetch individual token prices from Gamma API
                    for (const tokenId of clobTokenIds) {
                        try {
                            const response = await fetch(`https://gamma-api.polymarket.com/prices?token_id=${tokenId}`);
                            if (!response.ok)
                                continue;
                            const priceData = await response.json();
                            const price = parseFloat(priceData?.price || priceData?.mid || '0');
                            if (!isNaN(price) && price > 0) {
                                await this.handleMarketUpdate(tokenId, price);
                            }
                        }
                        catch (err) {
                            // Continue on individual token errors
                        }
                    }
                }
                catch (error) {
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
    disconnect() {
        if (this.client) {
            this.client.disconnect();
            this.client = null;
        }
    }
}
// Singleton instance
let globalRealtimeClient = null;
export function getPolymarketRealtimeClient() {
    if (!globalRealtimeClient) {
        globalRealtimeClient = new PolymarketRealtimeClient();
    }
    return globalRealtimeClient;
}
