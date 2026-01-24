import WebSocket from 'ws';
import { prisma } from '../../../lib/prisma';
import { redis } from '../../../lib/redis';
import { getPusherServer } from '../../../lib/pusher-server';

/**
 * Polymarket CLOB RTDS Client
 * Switched to CLOB for guaranteed delivery and accurate mid-prices.
 */
export class PolymarketRTDSClient {
    private ws: WebSocket | null = null;
    private tokens: string[] = [];
    private isActive = false;
    private mappingCache: Map<string, any> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;

    // The CLOB endpoint is much more reliable than Gamma for this worker
    private readonly WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

    constructor() { }

    async start() {
        this.isActive = true;
        this.connect();

        // Refresh mapping and subscriptions every 5 minutes
        setInterval(() => this.refreshSubscriptions(), 5 * 60 * 1000);
    }

    private connect() {
        if (!this.isActive) return;

        this.stopPing();
        console.log(`[RTDS] Connecting to ${this.WS_URL}...`);
        this.ws = new WebSocket(this.WS_URL);

        this.ws.on('open', () => {
            console.log('[RTDS] ✅ Connected to CLOB');
            this.startPing();
            this.refreshSubscriptions();
        });

        this.ws.on('message', (data) => this.handleMessage(data));

        this.ws.on('error', (err) => {
            console.error('[RTDS] ❌ Socket Error:', err);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[RTDS] 🔌 Connection closed (${code}) ${reason.toString()}. Reconnecting in 5s...`);
            this.stopPing();
            if (this.isActive) {
                setTimeout(() => this.connect(), 5000);
            }
        });
    }

    private startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                // CLOB uses a standard ping/pong
                this.ws.ping();
            }
        }, 20000);
    }

    private stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private async refreshSubscriptions() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        try {
            this.mappingCache.clear();

            const mappings = await prisma.polymarketMarketMapping.findMany({
                where: { isActive: true },
                include: { event: { select: { status: true, type: true, id: true } } }
            });

            const active = mappings.filter((m: any) => m.event?.status === 'ACTIVE');
            const tokenIds = new Set<string>();

            for (const map of active) {
                if (map.yesTokenId) tokenIds.add(map.yesTokenId);
                if (map.noTokenId) tokenIds.add(map.noTokenId);
            }

            const newTokens = Array.from(tokenIds).filter(id => id && id.length > 10); // Sanity check

            if (newTokens.length > 0) {
                console.log(`[RTDS] � Subscribing to ${newTokens.length} active tokens...`);

                // CLOB 'market' type is for initial batch subscription
                const payload = {
                    type: 'market',
                    assets_ids: newTokens
                };

                this.ws.send(JSON.stringify(payload));
                this.tokens = newTokens;
            }
        } catch (err) {
            console.error('[RTDS] Failed to refresh mappings:', err);
        }
    }

    private async handleMessage(data: WebSocket.Data) {
        try {
            const raw = data.toString();
            // Heartbeat/Ping responses are not JSON objects
            if (raw === 'PONG' || raw === '{"type":"pong"}') return;

            const msg = JSON.parse(raw);
            const updates = Array.isArray(msg) ? msg : [msg];

            for (const u of updates) {
                const assetId = u.asset_id || u.token_id;
                if (!assetId) continue;

                let price: number | null = null;

                // Priority 1: Mid-Price from Orderbook (Most Accurate)
                if (u.bids?.length > 0 || u.asks?.length > 0) {
                    const bestBid = u.bids?.[0]?.price ? parseFloat(u.bids[0].price) : null;
                    const bestAsk = u.asks?.[0]?.price ? parseFloat(u.asks[0].price) : null;

                    if (bestBid !== null && bestAsk !== null) {
                        price = (bestBid + bestAsk) / 2;
                    } else if (bestBid !== null) {
                        price = bestBid;
                    } else if (bestAsk !== null) {
                        price = bestAsk;
                    }
                }

                // Priority 2: Fallback to single price field
                if (price === null) {
                    const priceStr = u.price || u.last_trade_price;
                    if (priceStr) price = parseFloat(priceStr);
                }

                if (price !== null && !isNaN(price)) {
                    this.processUpdate(assetId, price).catch(err => {
                        console.error(`[RTDS] DB Update Error:`, err.message);
                    });
                }
            }
        } catch (err) {
            // Ignore parse errors for meta-messages
        }
    }

    private async processUpdate(asset_id: string, price: number) {
        let mapping = this.mappingCache.get(asset_id);
        if (!mapping) {
            mapping = await prisma.polymarketMarketMapping.findFirst({
                where: {
                    OR: [
                        { yesTokenId: asset_id },
                        { noTokenId: asset_id },
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

        if (isBinary && (mapping.yesTokenId === asset_id || mapping.noTokenId === asset_id)) {
            const isYes = mapping.yesTokenId === asset_id;
            yesPrice = isYes ? price : (1 - price);
            noPrice = 1 - yesPrice;

            await prisma.event.update({
                where: { id: event.id },
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

        // History Throttling (30s)
        const historyKey = `history_throttled:${asset_id}`;
        const lastWrite = this.mappingCache.get(historyKey) || 0;
        if (Date.now() - lastWrite > 30000) {
            const bucketTs = new Date(Math.floor(Date.now() / 300000) * 300000);
            const targetOutcome = isBinary
                ? event.outcomes?.find((o: any) => o.name?.toUpperCase() === (mapping.yesTokenId === asset_id ? 'YES' : 'NO'))
                : event.outcomes?.find((o: any) => o.polymarketOutcomeId === asset_id);

            if (targetOutcome) {
                await prisma.oddsHistory.upsert({
                    where: { eventId_outcomeId_timestamp: { eventId: event.id, outcomeId: targetOutcome.id, timestamp: bucketTs } },
                    update: { price, probability: price },
                    create: {
                        eventId: event.id,
                        outcomeId: targetOutcome.id,
                        timestamp: bucketTs,
                        price,
                        probability: price,
                        polymarketTokenId: asset_id,
                        source: 'POLYMARKET',
                    },
                });
                this.mappingCache.set(historyKey, Date.now());
            }
        }

        // Broadcast
        const broadcast = JSON.stringify({ eventId: event.id, assetId: asset_id, price, yesPrice, noPrice, timestamp: Date.now() });
        if (redis) await redis.publish(`event-updates:${event.id}`, broadcast);
        try {
            const pusher = getPusherServer();
            await pusher.trigger(`event-${event.id}`, 'odds-update', JSON.parse(broadcast));
        } catch (e) { }
    }
}
