import WebSocket from 'ws';
import { prisma } from '../../../lib/prisma';
import { redis } from '../../../lib/redis';
import { getPusherServer } from '../../../lib/pusher-server';

export class PolymarketRTDSClient {
    private ws: WebSocket | null = null;
    private tokens: string[] = [];
    private isActive = false;
    private mappingCache: Map<string, any> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;

    constructor() { }

    async start() {
        this.isActive = true;
        this.connect();

        // Refresh mapping every 5 minutes
        setInterval(() => this.refreshSubscriptions(), 5 * 60 * 1000);
    }

    private connect() {
        if (!this.isActive) return;

        this.stopPing(); // Ensure no double pings
        console.log('[RTDS] Connecting to wss://ws-live-data.polymarket.com...');
        this.ws = new WebSocket('wss://ws-live-data.polymarket.com');

        this.ws.on('open', () => {
            console.log('[RTDS] ✅ Connected');
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
                this.ws.send(JSON.stringify({ type: 'ping' }));
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
            // Clear mapping cache every refresh to ensure DB updates (names, outcomes) are picked up
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

            const newTokens = Array.from(tokenIds);

            // Only send if tokens changed or first time
            if (JSON.stringify(newTokens) !== JSON.stringify(this.tokens)) {
                console.log(`[RTDS] 🔌 Subscribing to ${newTokens.length} active tokens...`);

                // Correct protocol for ws-live-data.polymarket.com (Public Endpoint)
                // Use chunks to avoid request body limits
                const CHUNK_SIZE = 20;
                for (let i = 0; i < newTokens.length; i += CHUNK_SIZE) {
                    const chunk = newTokens.slice(i, i + CHUNK_SIZE);
                    this.ws.send(JSON.stringify({
                        type: 'subscribe',
                        assets_ids: chunk
                    }));
                }

                this.tokens = newTokens;
            }
        } catch (err) {
            console.error('[RTDS] Failed to refresh mappings:', err);
        }
    }

    private async handleMessage(data: WebSocket.Data) {
        try {
            const msg = JSON.parse(data.toString());
            const updates = Array.isArray(msg) ? msg : [msg];

            for (const u of updates) {
                // The public RTDS uses token_id and price
                const assetId = u.token_id || u.asset_id;
                const priceStr = u.price || u.last_trade_price || u.best_bid || u.best_ask;
                const price = typeof priceStr === 'number' ? priceStr : parseFloat(priceStr);

                if (assetId && !isNaN(price)) {
                    this.processUpdate(assetId, price).catch(err => {
                        console.error(`[RTDS] Process error for ${assetId}:`, err.message);
                    });
                }
            }
        } catch (err) {
            // Silently ignore parse errors (heartbeats, etc)
        }
    }

    private async processUpdate(asset_id: string, price: number) {
        // 1. Resolve Mapping
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

        // 2. Update Database (Outcomes and Event Odds)
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

        // 3. Update History (Throttled)
        const historyKey = `history_last_write:${asset_id}`;
        const lastWrite = this.mappingCache.get(historyKey) || 0;
        if (Date.now() - lastWrite > 60000) {
            const bucketTs = new Date(Math.floor(Date.now() / 300000) * 300000);

            const targetOutcome = isBinary
                ? event.outcomes?.find((o: any) => o.name?.toUpperCase() === (mapping.yesTokenId === asset_id ? 'YES' : 'NO'))
                : event.outcomes?.find((o: any) => o.polymarketOutcomeId === asset_id);

            if (targetOutcome) {
                await prisma.oddsHistory.upsert({
                    where: {
                        eventId_outcomeId_timestamp: {
                            eventId: event.id,
                            outcomeId: targetOutcome.id,
                            timestamp: bucketTs,
                        },
                    },
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

        // 4. Multi-channel Broadcast
        const payload = JSON.stringify({
            eventId: event.id,
            assetId: asset_id,
            price,
            yesPrice,
            noPrice,
            timestamp: Date.now()
        });

        if (redis) await redis.publish(`event-updates:${event.id}`, payload);

        try {
            const pusher = getPusherServer();
            await pusher.trigger(`event-${event.id}`, 'odds-update', JSON.parse(payload));
        } catch (e) { }
    }
}
