/**
 * Polymarket Trading Service
 *
 * Handles all interactions with Polymarket's CLOB (Central Limit Order Book) API
 * for automated hedging operations.
 *
 * API Documentation: https://docs.polymarket.com
 */

import { Wallet } from 'ethers';
import { ClobClient, Side as ClobSide, OrderType, TickSize } from '@polymarket/clob-client';

// Types
export interface PolymarketOrderRequest {
  marketId: string;
  conditionId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number; // Number of shares
  price: number; // Price in decimal (0.01 to 0.99)
  expiration?: number; // Unix timestamp, defaults to 30 days
  nonce?: number;
}

export interface PolymarketOrder {
  orderId: string;
  marketId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  status: 'OPEN' | 'MATCHED' | 'CANCELLED';
  filledSize: number;
  remainingSize: number;
  createdAt: number;
  updatedAt: number;
}

export interface OrderbookSnapshot {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}

export interface LiquidityCheck {
  canHedge: boolean;
  availableSize: number;
  bestPrice: number;
  estimatedSlippage: number;
  reason?: string;
}

class PolymarketTradingService {
  private apiUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private passphrase: string;
  private privateKey: string;
  private wallet: Wallet | null = null;
  private chainId: number;
  private clobClient: ClobClient | null = null;

  constructor() {
    this.apiUrl = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
    this.apiKey = process.env.POLYMARKET_API_KEY || '';
    this.apiSecret = process.env.POLYMARKET_API_SECRET || '';
    this.passphrase = process.env.POLYMARKET_PASSPHRASE || '';
    this.privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    this.chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137'); // Polygon mainnet

    if (this.privateKey && this.privateKey !== 'YOUR_PRIVATE_KEY_HERE') {
      try {
        this.wallet = new Wallet(this.privateKey);
      } catch (error) {
        console.error('[Polymarket] Failed to initialize wallet:', error);
      }
    }

    this.initializeClient();
  }

  /**
   * Initialize the Polymarket CLOB client using provided credentials
   */
  private initializeClient() {
    if (!this.wallet) return;

    try {
      const creds =
        this.apiKey && this.apiSecret && this.passphrase
          ? { key: this.apiKey, secret: this.apiSecret, passphrase: this.passphrase }
          : undefined;

      // signatureType: 0 = browser wallet, 1 = magic/email. We default to 0.
      const signatureType = 0;
      // clob-client typings expect an ethers v5 wallet; cast v6 wallet for compatibility.
      this.clobClient = new ClobClient(this.apiUrl, this.chainId, this.wallet as any, creds, signatureType);
    } catch (error) {
      console.error('[Polymarket] Failed to initialize CLOB client:', error);
      this.clobClient = null;
    }
  }

  /**
   * Check if trading is enabled (credentials configured)
   */
  isEnabled(): boolean {
    return !!(this.wallet && this.clobClient);
  }

  /**
   * Get current orderbook depth for a market
   */
  async getOrderbook(marketId: string): Promise<OrderbookSnapshot> {
    if (!this.clobClient) {
      throw new Error('Polymarket trading not initialized');
    }

    try {
      const ob = await this.clobClient.getOrderBook(marketId);

      return {
        bids:
          ob.bids?.map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
          })) || [],
        asks:
          ob.asks?.map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
          })) || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[Polymarket] Failed to fetch orderbook:', error);
      throw error;
    }
  }

  /**
   * Check if we can hedge a position with acceptable slippage
   */
  async checkLiquidity(
    marketId: string,
    side: 'BUY' | 'SELL',
    size: number,
    maxSlippageBps: number = 100 // 1% default
  ): Promise<LiquidityCheck> {
    try {
      const orderbook = await this.getOrderbook(marketId);
      
      // For BUY orders, check asks (we need to buy from sellers)
      // For SELL orders, check bids (we need to sell to buyers)
      const levels = side === 'BUY' ? orderbook.asks : orderbook.bids;
      
      if (levels.length === 0) {
        return {
          canHedge: false,
          availableSize: 0,
          bestPrice: 0,
          estimatedSlippage: 0,
          reason: 'No liquidity available',
        };
      }

      // Calculate how much we can fill and at what average price
      let remainingSize = size;
      let totalCost = 0;
      const bestPrice = levels[0].price;

      for (const level of levels) {
        if (remainingSize <= 0) break;
        
        const fillSize = Math.min(remainingSize, level.size);
        totalCost += fillSize * level.price;
        remainingSize -= fillSize;
      }

      const filledSize = size - remainingSize;
      const avgPrice = filledSize > 0 ? totalCost / filledSize : 0;
      
      // Calculate slippage in basis points
      const slippage = Math.abs((avgPrice - bestPrice) / bestPrice) * 10000;

      const canHedge = filledSize >= size * 0.95 && slippage <= maxSlippageBps;

      return {
        canHedge,
        availableSize: filledSize,
        bestPrice: avgPrice,
        estimatedSlippage: slippage,
        reason: !canHedge 
          ? `Insufficient liquidity or high slippage (${slippage.toFixed(0)}bps > ${maxSlippageBps}bps)`
          : undefined,
      };
    } catch (error) {
      console.error('[Polymarket] Liquidity check failed:', error);
      return {
        canHedge: false,
        availableSize: 0,
        bestPrice: 0,
        estimatedSlippage: 0,
        reason: 'Failed to check liquidity',
      };
    }
  }

  /**
   * Place a limit order on Polymarket
   */
  async placeOrder(request: PolymarketOrderRequest): Promise<PolymarketOrder> {
    if (!this.clobClient || !this.wallet) {
      throw new Error('Polymarket trading not enabled - missing credentials');
    }

    try {
      // Fetch orderbook to derive tick size / neg risk
      const ob = await this.clobClient.getOrderBook(request.tokenId);
      const tickSize: TickSize | undefined = (ob as any).tick_size ?? undefined;
      const negRisk = ob.neg_risk ?? false;

      const orderResponse = await this.clobClient.createAndPostOrder(
        {
          tokenID: request.tokenId,
          price: request.price,
          side: request.side === 'BUY' ? ClobSide.BUY : ClobSide.SELL,
          size: request.size,
          expiration: request.expiration,
          nonce: request.nonce,
        },
        { tickSize, negRisk },
        OrderType.GTC
      );

      return {
        orderId: orderResponse.orderID || orderResponse.id,
        marketId: request.marketId,
        side: request.side,
        size: request.size,
        price: request.price,
        status: 'OPEN',
        filledSize: 0,
        remainingSize: request.size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (error) {
      console.error('[Polymarket] Failed to place order:', error);
      throw error;
    }
  }

  /**
   * Place a market order (implemented as aggressive limit order)
   */
  async placeMarketOrder(
    marketId: string,
    conditionId: string,
    tokenId: string,
    side: 'BUY' | 'SELL',
    size: number
  ): Promise<PolymarketOrder> {
    // Get current orderbook
    const orderbook = await this.getOrderbook(marketId);
    
    // Use aggressive pricing to ensure fill
    const levels = side === 'BUY' ? orderbook.asks : orderbook.bids;
    if (levels.length === 0) {
      throw new Error('No liquidity available for market order');
    }

    // Price aggressively: for buy use highest ask + buffer, for sell use lowest bid - buffer
    const aggressivePrice = side === 'BUY'
      ? Math.min(0.99, levels[levels.length - 1].price * 1.02)
      : Math.max(0.01, levels[0].price * 0.98);

    return this.placeOrder({
      marketId,
      conditionId,
      tokenId,
      side,
      size,
      price: aggressivePrice,
    });
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.clobClient) {
      throw new Error('Polymarket trading not enabled');
    }

    try {
      const res = await this.clobClient.cancelOrder({ orderID: orderId });
      return !!res;
    } catch (error) {
      console.error('[Polymarket] Failed to cancel order:', error);
      return false;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<PolymarketOrder | null> {
    if (!this.clobClient) return null;

    try {
      const data = await this.clobClient.getOrder(orderId);

      const raw = data as any;
      const normalizedSide = (raw.side || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
      const originalSize = raw.originalSize ?? raw.original_size ?? raw.size ?? 0;
      const sizeMatched = raw.sizeMatched ?? raw.size_matched ?? 0;
      const sizeRemaining = raw.sizeRemaining ?? raw.size ?? 0;
      const createdAt = raw.createdAt ?? raw.created_at ?? Date.now();
      const updatedAt = raw.updatedAt ?? raw.updated_at ?? Date.now();
      const normalizedStatus = (() => {
        const s = (raw.status || '').toUpperCase();
        if (s === 'MATCHED') return 'MATCHED';
        if (s === 'CANCELLED') return 'CANCELLED';
        return 'OPEN';
      })();

      return {
        orderId: data.id,
        marketId: data.market,
        side: normalizedSide,
        size: parseFloat(originalSize),
        price: parseFloat(data.price),
        status: normalizedStatus,
        filledSize: parseFloat(sizeMatched),
        remainingSize: parseFloat(sizeRemaining),
        createdAt,
        updatedAt,
      };
    } catch (error) {
      console.error('[Polymarket] Failed to get order status:', error);
      return null;
    }
  }

  /**
   * Calculate optimal hedge price with spread
   */
  calculateHedgePrice(
    userPrice: number,
    side: 'buy' | 'sell',
    spreadBps: number
  ): number {
    const spreadDecimal = spreadBps / 10000;
    
    if (side === 'buy') {
      // User buys from us at userPrice
      // We buy from Polymarket at lower price to capture spread
      return Math.max(0.01, userPrice * (1 - spreadDecimal));
    } else {
      // User sells to us at userPrice
      // We sell on Polymarket at higher price to capture spread
      return Math.min(0.99, userPrice * (1 + spreadDecimal));
    }
  }
}

// Export singleton instance
export const polymarketTrading = new PolymarketTradingService();

// Helper function to estimate fees
export function estimatePolymarketFees(size: number, price: number): number {
  // Polymarket typically charges ~2% fee
  const tradingFee = size * price * 0.02;
  // Approximate gas cost (varies with network conditions)
  const gasCost = 0.1; // ~$0.10 in MATIC
  
  return tradingFee + gasCost;
}

