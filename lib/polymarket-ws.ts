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

      // Find event by asset_id (condition token ID)
      const mapping = await prisma.polymarketMarketMapping.findFirst({
        where: {
          OR: [
            { yesTokenId: asset_id },
            { noTokenId: asset_id },
          ]
        },
        include: {
          event: true,
        }
      });

      if (!mapping) return;

      // Update event odds in database
      const isYes = mapping.yesTokenId === asset_id;
      const price = parseFloat(data.price || data.best_bid || '0.5');

      const updateData = isYes 
        ? { yesOdds: price }
        : { noOdds: price };

      await prisma.event.update({
        where: { id: mapping.eventId },
        data: updateData,
      });

      console.log(`[Polymarket WS] Updated odds for "${mapping.event.title.substring(0, 40)}": ${isYes ? 'YES' : 'NO'} = ${price}`);

      // Broadcast via Redis for our WebSocket to pick up
      if (redis) {
        await redis.publish('sports-odds', JSON.stringify({
          eventId: mapping.eventId,
          [isYes ? 'yesOdds' : 'noOdds']: price,
          timestamp: Date.now(),
        }));
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
   * Subscribe to all active sports events
   */
  public async subscribeToAllSportsEvents() {
    try {
      // Get all active sports events with market mappings
      const mappings = await prisma.polymarketMarketMapping.findMany({
        where: {
          event: {
            status: 'ACTIVE',
            OR: [
              { isEsports: true },
              { sport: { not: null } },
            ],
          },
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              live: true,
            },
          },
        },
      });

      console.log(`[Polymarket WS] Found ${mappings.length} sports events to subscribe to`);

      // Subscribe to both YES and NO tokens for each event
      for (const mapping of mappings) {
        if (mapping.yesTokenId) {
          this.subscribeToMarket(mapping.yesTokenId);
        }
        if (mapping.noTokenId) {
          this.subscribeToMarket(mapping.noTokenId);
        }
      }

      console.log(`[Polymarket WS] ✅ Subscribed to ${this.subscribedMarkets.size} markets`);
    } catch (error) {
      console.error('[Polymarket WS] Error subscribing to sports events:', error);
    }
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

