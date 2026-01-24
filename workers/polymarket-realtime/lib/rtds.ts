import WebSocket from 'ws';
import { prisma } from '../../../lib/prisma';
import { redis } from '../../../lib/redis';
import { getPusherServer } from '../../../lib/pusher-server';

/**
 * Polymarket CLOB RTDS Client
 * Switched to CLOB for high-fidelity data.
 * Fixed: Sorting logic for best bid/ask to stop the 0.5 price spikes.
 */
export class PolymarketRTDSClient {
    private ws: WebSocket | null = null;
    private tokens: string[] = [];
    private isActive = false;
    private mappingCache: Map<string, any> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;

    private readonly WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

    constructor() { }

    async start() {
        this.isActive = true;
        this.connect();
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
        this.ws.on('error', (err) => console.error('[RTDS] ❌ Socket Error:', err));
        this.ws.on('close', (code, reason) => {
            console.log(`[RTDS] 🔌 Closed (${code}) ${reason}. Reconnecting in 5s...`);
            this.stopPing();
            if (this.isActive) setTimeout(() => this.connect(), 5000);
        });
    }

    private startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
        }, 20000);
    }

    private stopPing() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = null;
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

            const newTokens = Array.from(tokenIds).filter(id => id && id.length > 10);
            if (newTokens.length > 0) {
                console.log(`[RTDS] 📡 Subscribing to ${newTokens.length} active tokens...`);
                // Use 'market' for batch subscription on CLOB
                this.ws.send(JSON.stringify({ type: 'market', assets_ids: newTokens }));
                this.tokens = newTokens;
            }
        } catch (err) {
            console.error('[RTDS] Mapping refresh failed:', err);
        }
    }

    private async handleMessage(data: WebSocket.Data) {
        try {
            const raw = data.toString();
            if (raw === 'PONG' || raw === '{"type":"pong"}') return;

            const msg = JSON.parse(raw);

            if (msg.event_type === 'price_change' && Array.isArray(msg.price_changes)) {
                for (const change of msg.price_changes) {
                    await this.processPriceUpdate(change);
                }
            }
            else if (msg.event_type === 'book' || (msg.bids && msg.asks)) {
                await this.processPriceUpdate(msg);
            }
            else if (Array.isArray(msg)) {
                for (const item of msg) {
                    await this.processPriceUpdate(item);
                }
            }
        } catch (err) { }
    }

    private async processPriceUpdate(u: any) {
        const assetId = u.asset_id || u.token_id;
        if (!assetId) return;

        let price: number | null = null;

        // Corrected Best Bid/Ask Logic: CLOB often returns arrays sorted inverted or random
        let bestBid: number | null = u.best_bid ? parseFloat(u.best_bid) : null;
        let bestAsk: number | null = u.best_ask ? parseFloat(u.best_ask) : null;

        if (bestBid === null && u.bids?.length > 0) {
            // Best bid is the HIGHEST price someone is willing to pay
            bestBid = Math.max(...u.bids.map((b: any) => parseFloat(b.price)));
        }

        if (bestAsk === null && u.asks?.length > 0) {
            // Best ask is the LOWEST price someone is willing to sell for
            bestAsk = Math.min(...u.asks.map((a: any) => parseFloat(a.price)));
        }

        if (bestBid !== null && bestAsk !== null) {
            price = (bestBid + bestAsk) / 2;
        } else if (bestBid !== null) {
            price = bestBid;
        } else if (bestAsk !== null) {
            price = bestAsk;
        }

        // Fallback to Last Trade Price
        if (price === null) {
            const lastTrade = u.price || u.last_trade_price;
            if (lastTrade) price = parseFloat(lastTrade);
        }

        // Final sanity check: Polymarket prices are ALWAYS between 0 and 1
        if (price !== null && !isNaN(price) && price > 0 && price < 1) {
            // Anti-Ghosting: If price is EXACTLY 0.5, we check if it was derived from an e.g. 0.001 bid and 0.999 ask
            // In a healthy market, the spread is tight. If spread > 0.5, we ignore the mid-price as unreliable.
            if (bestBid !== null && bestAsk !== null) {
                const spread = bestAsk - bestBid;
                if (spread > 0.5) {
                    // This is usually a zombie market or bad data packet
                    return;
                }
            }
            await this.persistUpdate(assetId, price);
        }
    }

    private async persistUpdate(asset_id: string, price: number) {
        let mapping = this.mappingCache.get(asset_id);
        if (!mapping) {
            mapping = await prisma.polymarketMarketMapping.findFirst({
                where: { OR: [{ yesTokenId: asset_id }, { noTokenId: asset_id }] },
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

        const payload = JSON.stringify({ eventId: event.id, assetId: asset_id, price, yesPrice, noPrice, timestamp: Date.now() });
        if (redis) await redis.publish(`event-updates:${event.id}`, payload);
        try {
            const pusher = getPusherServer();
            await pusher.trigger(`event-${event.id}`, 'odds-update', JSON.parse(payload));
        } catch (e) { }
    }
}
