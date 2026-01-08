/**
 * Polymarket WebSocket Client
 * Real-time updates for sports events, markets, and odds
 * 
 * Connects to: wss://ws-subscriptions-clob.polymarket.com
 */

import WebSocket from 'ws';
import { prisma } from './prisma';
import { redis } from './redis';

interface PolymarketWSMessage {
  event_type: 'market' | 'book' | 'tick_size' | 'last_trade_price' | 'user';
  market?: string;
  asset_id?: string;
  hash?: string;
  data?: any;
}

interface MarketUpdate {
  market: string;
  asset_id: string;
  price: string;
  side: 'BUY' | 'SELL';
  size: string;
  timestamp: number;
}

class PolymarketWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private subscribedMarkets: Set<string> = new Set();
  private isConnected = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.connect();
    this.setupDynamicSubscription();
  }

  private connect() {
    try {
      console.log('[Polymarket WS] Connecting to WebSocket...');

      this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com');

      this.ws.on('open', () => {
        console.log('[Polymarket WS] ✅ Connected!');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Start heartbeat
        this.startHeartbeat();

        // Resubscribe to markets
        this.resubscribeToMarkets();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('[Polymarket WS] Error:', error.message);
      });

      this.ws.on('close', () => {
        console.log('[Polymarket WS] Disconnected');
        this.isConnected = false;
        this.stopHeartbeat();
        this.attemptReconnect();
      });

    } catch (error) {
      console.error('[Polymarket WS] Failed to connect:', error);
      this.attemptReconnect();
    }
  }

  private startHeartbeat() {
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.ping();
      }
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
    console.log(`[Polymarket WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private async handleMessage(data: WebSocket.Data) {
    try {
      const message = JSON.parse(data.toString()) as PolymarketWSMessage;

      // Handle different message types
      switch (message.event_type) {
        case 'market':
          await this.handleMarketUpdate(message);
          break;
        case 'book':
          await this.handleOrderBookUpdate(message);
          break;
        case 'last_trade_price':
          await this.handlePriceUpdate(message);
          break;
        default:
          // Ignore other message types
          break;
      }
    } catch (error) {
      console.error('[Polymarket WS] Error parsing message:', error);
    }
  }

  private async handleMarketUpdate(message: PolymarketWSMessage) {
    try {
      const { asset_id, data } = message;
      if (!asset_id || !data) return;

      // Primary lookup: Find by yesTokenId or noTokenId (binary events)
      let mapping = await prisma.polymarketMarketMapping.findFirst({
        where: {
          OR: [
            { yesTokenId: asset_id },
            { noTokenId: asset_id },
          ]
        },
        include: {
          event: {
            include: {
              outcomes: true,
            }
          },
        }
      });

      // Fallback lookup: Check outcomeMapping JSON for MULTIPLE events
      // outcomeMapping.outcomes[].polymarketId contains token IDs
      if (!mapping) {
        // PostgreSQL JSON query for array contains
        const rawMappings = await prisma.$queryRaw<any[]>`
          SELECT pm.*, e.id as event_id, e.title, e.type
          FROM "PolymarketMarketMapping" pm
          JOIN "Event" e ON pm."internalEventId" = e.id
          WHERE pm."outcomeMapping"::jsonb -> 'outcomes' @> ${JSON.stringify([{ polymarketId: asset_id }])}::jsonb
          LIMIT 1
        `;

        if (rawMappings && rawMappings.length > 0) {
          const raw = rawMappings[0];
          // Fetch full mapping with includes
          mapping = await prisma.polymarketMarketMapping.findUnique({
            where: { id: raw.id },
            include: {
              event: {
                include: {
                  outcomes: true,
                }
              },
            }
          });
        }
      }

      if (!mapping || !mapping.event) return;

      const price = parseFloat(data.price || data.best_bid || '0.5');
      const event = mapping.event;

      // Handle binary events (yesTokenId/noTokenId match)
      if (mapping.yesTokenId === asset_id || mapping.noTokenId === asset_id) {
        const isYes = mapping.yesTokenId === asset_id;

        await prisma.event.update({
          where: { id: mapping.internalEventId },
          data: isYes ? { yesOdds: price } : { noOdds: price },
        });

        console.log(`[Polymarket WS] Updated binary odds for "${event.title?.substring(0, 40)}": ${isYes ? 'YES' : 'NO'} = ${price}`);

        // Broadcast binary update
        if (redis) {
          await redis.publish('sports-odds', JSON.stringify({
            eventId: mapping.internalEventId,
            yesPrice: isYes ? price : undefined,
            noPrice: isYes ? undefined : price,
            timestamp: Date.now(),
          }));
        }
      } else {
        // Handle MULTIPLE/GROUPED_BINARY events - find matching outcome
        const outcome = event.outcomes?.find((o: any) => o.polymarketOutcomeId === asset_id);

        if (outcome) {
          await prisma.outcome.update({
            where: { id: outcome.id },
            data: { probability: price },
          });

          console.log(`[Polymarket WS] Updated outcome "${outcome.name}" for "${event.title?.substring(0, 40)}": ${price}`);

          // Broadcast multiple outcome update
          if (redis) {
            // Fetch all outcomes for consistent broadcast
            const allOutcomes = await prisma.outcome.findMany({
              where: { eventId: mapping.internalEventId },
              select: { id: true, name: true, probability: true },
            });

            await redis.publish('sports-odds', JSON.stringify({
              eventId: mapping.internalEventId,
              outcomes: allOutcomes.map((o: { id: string; name: string; probability: number | null }) => ({
                id: o.id,
                name: o.name,
                probability: o.probability,
              })),
              timestamp: Date.now(),
            }));
          }
        }
      }

    } catch (error) {
      console.error('[Polymarket WS] Error handling market update:', error);
    }
  }

  private async handleOrderBookUpdate(message: PolymarketWSMessage) {
    // Similar to handleMarketUpdate but for order book depth
    // Can be implemented if needed for more detailed data
  }

  private async handlePriceUpdate(message: PolymarketWSMessage) {
    // Handle last trade price updates
    await this.handleMarketUpdate(message);
  }

  /**
   * Subscribe to a specific market (condition token)
   */
  public subscribeToMarket(assetId: string) {
    if (!this.ws || !this.isConnected) {
      console.log(`[Polymarket WS] Cannot subscribe to ${assetId} - not connected`);
      return;
    }

    if (this.subscribedMarkets.has(assetId)) {
      return; // Already subscribed
    }

    const subscribeMessage = {
      type: 'subscribe',
      channel: 'market',
      asset_id: assetId,
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    this.subscribedMarkets.add(assetId);
    console.log(`[Polymarket WS] Subscribed to market: ${assetId}`);
  }

  /**
   * Unsubscribe from a market
   */
  public unsubscribeFromMarket(assetId: string) {
    if (!this.ws || !this.isConnected) return;

    const unsubscribeMessage = {
      type: 'unsubscribe',
      channel: 'market',
      asset_id: assetId,
    };

    this.ws.send(JSON.stringify(unsubscribeMessage));
    this.subscribedMarkets.delete(assetId);
    console.log(`[Polymarket WS] Unsubscribed from market: ${assetId}`);
  }

  /**
   * Subscribe to all active events with Polymarket mappings
   * Previously: subscribeToAllSportsEvents (only sports/esports)
   * Now: subscribes to ALL active events with valid token IDs
   */
  public async subscribeToAllActiveEvents() {
    try {
      // Get ALL active events with market mappings that have token IDs
      const mappings = await prisma.polymarketMarketMapping.findMany({
        where: {
          isActive: true,
          OR: [
            { yesTokenId: { not: null } },
            { noTokenId: { not: null } },
          ],
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

      // Filter to only ACTIVE events (in case mapping.isActive doesn't reflect event status)
      const activeEventMappings = mappings.filter((m: typeof mappings[number]) => m.event?.status === 'ACTIVE');

      console.log(`[Polymarket WS] Found ${activeEventMappings.length} active events to subscribe to`);

      // Subscribe to both YES and NO tokens for each event
      for (const mapping of activeEventMappings) {
        if (mapping.yesTokenId) {
          this.subscribeToMarket(mapping.yesTokenId);
        }
        if (mapping.noTokenId) {
          this.subscribeToMarket(mapping.noTokenId);
        }
      }

      console.log(`[Polymarket WS] ✅ Subscribed to ${this.subscribedMarkets.size} markets`);
    } catch (error) {
      console.error('[Polymarket WS] Error subscribing to active events:', error);
    }
  }

  /**
   * @deprecated Use subscribeToAllActiveEvents() instead
   */
  public async subscribeToAllSportsEvents() {
    return this.subscribeToAllActiveEvents();
  }

  /**
   * Subscribe to a single market by its mapping (called when new market is approved)
   */
  public subscribeToMapping(mapping: { yesTokenId?: string | null; noTokenId?: string | null }) {
    if (mapping.yesTokenId) {
      this.subscribeToMarket(mapping.yesTokenId);
    }
    if (mapping.noTokenId) {
      this.subscribeToMarket(mapping.noTokenId);
    }
  }

  /**
   * Set up Redis listener for dynamic market subscriptions
   * Called when new markets are approved
   */
  public async setupDynamicSubscription() {
    if (!redis) {
      console.warn('[Polymarket WS] Redis not available, dynamic subscription disabled');
      return;
    }

    // Create separate Redis client for subscription (can't use same client for pub/sub and commands)
    const { Redis } = await import('ioredis');
    const subClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    subClient.subscribe('new-market-approved', (err) => {
      if (err) {
        console.error('[Polymarket WS] Failed to subscribe to new-market-approved:', err);
        return;
      }
      console.log('[Polymarket WS] 📡 Listening for new market approvals');
    });

    subClient.on('message', (channel, message) => {
      if (channel === 'new-market-approved') {
        try {
          const mapping = JSON.parse(message);
          console.log(`[Polymarket WS] New market approved, subscribing: ${mapping.internalEventId}`);
          this.subscribeToMapping(mapping);
        } catch (err) {
          console.error('[Polymarket WS] Error processing new market:', err);
        }
      }
    });
  }


  private resubscribeToMarkets() {
    // After reconnection, resubscribe to all markets
    const markets = Array.from(this.subscribedMarkets);
    this.subscribedMarkets.clear();

    markets.forEach(assetId => {
      this.subscribeToMarket(assetId);
    });
  }

  /**
   * Graceful shutdown
   */
  public disconnect() {
    console.log('[Polymarket WS] Disconnecting...');

    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.subscribedMarkets.clear();
  }
}

// Singleton instance
let wsClient: PolymarketWebSocketClient | null = null;

export function getPolymarketWSClient(): PolymarketWebSocketClient {
  if (!wsClient) {
    wsClient = new PolymarketWebSocketClient();
  }
  return wsClient;
}

export function disconnectPolymarketWS() {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}

