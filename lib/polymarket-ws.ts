/**
 * Polymarket WebSocket Client
 * Real-time updates for sports events, markets, and odds
 * 
 * Performance Optimized: Uses internal caching to avoid DB lookups on every message.
 * Integrated: Directly broadcasts to Pusher (Soketi) for instant UI updates.
 */

import WebSocket from 'ws';
import { z } from 'zod';
import { prisma } from './prisma';
import { redis, buildTlsConfig } from './redis';
import { getPusherServer } from './pusher-server';
import { env } from './env';

const PolymarketWSMessageSchema = z.object({
  event_type: z.enum(['market', 'book', 'tick_size', 'last_trade_price', 'user']),
  market: z.string().optional(),
  asset_id: z.string().optional(),
  hash: z.string().optional(),
  data: z.any().optional(),
});

type PolymarketWSMessage = z.infer<typeof PolymarketWSMessageSchema>;

export interface PolymarketWSClientOptions {
  onPriceUpdate?: (tokenId: string, price: number) => Promise<void>;
  autoUpdateDb?: boolean;
}

// Circuit breaker states for resilience
enum CircuitState {
  CLOSED = 'CLOSED',        // Normal operation
  OPEN = 'OPEN',            // Too many failures, stop trying
  HALF_OPEN = 'HALF_OPEN'   // Testing if service recovered
}

export class PolymarketWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private subscribedMarkets: Set<string> = new Set();
  private isConnected = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private options: PolymarketWSClientOptions;

  // Circuit breaker for resilience
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly FAILURE_THRESHOLD = 5;      // Open after 5 failures
  private readonly RESET_TIMEOUT = 60000;      // Retry after 60s
  private readonly HALF_OPEN_TIMEOUT = 10000;  // Test timeout

  // Performance cache: asset_id -> Mapping with Event & Outcomes
  private mappingCache: Map<string, any> = new Map();

  constructor(options: PolymarketWSClientOptions = {}) {
    this.options = { autoUpdateDb: true, ...options };
    this.connect();
    this.setupDynamicSubscription();
  }

  private connect() {
    // ============================================================================
    // CIRCUIT BREAKER: Check before connecting
    // ============================================================================
    if (this.circuitState === CircuitState.OPEN) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > this.RESET_TIMEOUT) {
        console.log('[Polymarket WS] Circuit HALF_OPEN - testing connection');
        this.circuitState = CircuitState.HALF_OPEN;
      } else {
        const retryIn = Math.ceil((this.RESET_TIMEOUT - timeSinceFailure) / 1000);
        console.warn(`[Polymarket WS] ⚠️ Circuit OPEN - skipping reconnect (retry in ${retryIn}s)`);
        return;
      }
    }

    try {
      console.log('[Polymarket WS] Connecting... 🔌');
      this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');

      this.ws.on('open', () => {
        console.log('[Polymarket WS] ✅ Connected!');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        // Reset circuit breaker on successful connection
        this.failureCount = 0;
        this.circuitState = CircuitState.CLOSED;
        this.startHeartbeat();
        this.resubscribeToMarkets();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('[Polymarket WS] Error:', error.message);
        this.handleFailure();
      });

      this.ws.on('close', () => {
        console.log('[Polymarket WS] 🔌 Disconnected');
        this.isConnected = false;
        this.stopHeartbeat();
        this.handleFailure();
      });
    } catch (error) {
      console.error('[Polymarket WS] Failed to connect:', error);
      this.handleFailure();
    }
  }

  private handleFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.circuitState = CircuitState.OPEN;
      console.error(`[Polymarket WS] ⚠️ CIRCUIT BREAKER OPEN - ${this.failureCount} consecutive failures`);
      console.error(`[Polymarket WS] Will retry in ${this.RESET_TIMEOUT / 1000}s`);
      console.error('[Polymarket WS] 🚨 ALERT: Real-time odds updates are DOWN');
      // TODO: Send alert to monitoring (Slack/email/Sentry)

      // Schedule retry after reset timeout
      setTimeout(() => {
        if (this.circuitState === CircuitState.OPEN) {
          console.log('[Polymarket WS] Attempting recovery from circuit breaker...');
          this.connect();
        }
      }, this.RESET_TIMEOUT);
    } else {
      // Still have attempts left, try reconnecting
      this.attemptReconnect();
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isConnected) this.ws.ping();
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private attemptReconnect() {
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

  private async handleMessage(data: WebSocket.Data) {
    try {
      const parsed = PolymarketWSMessageSchema.safeParse(JSON.parse(data.toString()));
      if (!parsed.success) {
        console.warn('[Polymarket WS] Received invalid message format:', parsed.error.format());
        return;
      }
      const message = parsed.data;
      if (message.event_type === 'last_trade_price' && message.asset_id && message.data) {
        const price = parseFloat(message.data);
        if (!isNaN(price)) {
          await this.handleMarketUpdate(message.asset_id, price);
        }
      }
    } catch (error) { }
  }

  /**
   * Main handler for real-time market updates
   */
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
      } catch (err) {
        // Pusher might fail in some envs
      }

    } catch (error: any) {
      console.error('[Polymarket WS] Error handling update:', error.message);
    }
  }

  public subscribe(assetId: string) {
    if (!this.ws || !this.isConnected) {
      this.subscribedMarkets.add(assetId);
      return;
    }
    this.ws.send(JSON.stringify({ type: 'subscribe', event_type: 'last_trade_price', asset_id: assetId }));
    this.subscribedMarkets.add(assetId);
  }

  private resubscribeToMarkets() {
    const markets = Array.from(this.subscribedMarkets);
    this.subscribedMarkets.clear();
    for (const m of markets) this.subscribe(m);
  }

  public async subscribeToAllActiveEvents() {
    try {
      const mappings = await prisma.polymarketMarketMapping.findMany({
        where: { isActive: true },
        include: { event: { select: { status: true } } }
      });

      const active = mappings.filter((m: any) => m.event?.status === 'ACTIVE');
      console.log(`[Polymarket WS] Subscribing to ${active.length} active mappings...`);

      for (const mapping of active) {
        if (mapping.yesTokenId) this.subscribe(mapping.yesTokenId);
        if (mapping.noTokenId) this.subscribe(mapping.noTokenId);
        const outcomes = (mapping.outcomeMapping as any)?.outcomes;
        if (Array.isArray(outcomes)) {
          outcomes.forEach((o: any) => { if (o.polymarketId) this.subscribe(o.polymarketId); });
        }
      }
    } catch (error) {
      console.error('[Polymarket WS] Failed to subscribe to active events:', error);
    }
  }

  /**
   * Alias for backwards compatibility
   */
  public async subscribeToAllSportsEvents() {
    return this.subscribeToAllActiveEvents();
  }

  public async setupDynamicSubscription() {
    if (!redis) return;
    const { Redis } = await import('ioredis');
    const sub = new Redis(env.REDIS_URL, {
      tls: buildTlsConfig(),
      maxRetriesPerRequest: null, // Subscriptions should wait forever
    });
    await sub.subscribe('polymarket:new-market');
    sub.on('message', async () => {
      await this.subscribeToAllActiveEvents();
    });
  }
}

// Singleton instance for app-wide use
let globalWsClient: PolymarketWebSocketClient | null = null;

export function getPolymarketWSClient() {
  if (!globalWsClient) {
    globalWsClient = new PolymarketWebSocketClient();
  }
  return globalWsClient;
}
