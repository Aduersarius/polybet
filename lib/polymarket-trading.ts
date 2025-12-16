/**
 * Polymarket Trading Service
 * 
 * Handles all interactions with Polymarket's CLOB (Central Limit Order Book) API
 * for automated hedging operations.
 * 
 * API Documentation: https://docs.polymarket.com
 */

import { ethers } from 'ethers';

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
  private wallet: ethers.Wallet | null = null;
  private chainId: number;

  constructor() {
    this.apiUrl = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
    this.apiKey = process.env.POLYMARKET_API_KEY || '';
    this.apiSecret = process.env.POLYMARKET_API_SECRET || '';
    this.passphrase = process.env.POLYMARKET_PASSPHRASE || '';
    this.privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    this.chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137'); // Polygon mainnet

    if (this.privateKey && this.privateKey !== 'YOUR_PRIVATE_KEY_HERE') {
      try {
        this.wallet = new ethers.Wallet(this.privateKey);
      } catch (error) {
        console.error('[Polymarket] Failed to initialize wallet:', error);
      }
    }
  }

  /**
   * Check if trading is enabled (credentials configured)
   */
  isEnabled(): boolean {
    return !!(
      this.apiKey && 
      this.apiKey !== 'YOUR_API_KEY_HERE' &&
      this.wallet
    );
  }

  /**
   * Generate authentication headers for API requests
   */
  private getAuthHeaders(method: string, path: string, body?: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'POLY-API-KEY': this.apiKey,
    };

    // If secret and passphrase are provided, add signature
    if (this.apiSecret && this.passphrase) {
      const timestamp = Date.now().toString();
      const message = timestamp + method + path + (body ? JSON.stringify(body) : '');
      
      // Create HMAC signature
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(message)
        .digest('base64');

      headers['POLY-SIGNATURE'] = signature;
      headers['POLY-TIMESTAMP'] = timestamp;
      headers['POLY-PASSPHRASE'] = this.passphrase;
    }

    return headers;
  }

  /**
   * Get current orderbook depth for a market
   */
  async getOrderbook(marketId: string): Promise<OrderbookSnapshot> {
    try {
      // Try different possible endpoints
      const endpoints = [
        { url: `${this.apiUrl}/book?token_id=${marketId}`, method: 'GET' },
        { url: `${this.apiUrl}/book/${marketId}`, method: 'GET' },
        { url: `${this.apiUrl}/markets/${marketId}/book`, method: 'GET' },
        { url: `${this.apiUrl}/book`, method: 'POST' },
      ];

      let lastError: Error | null = null;

      for (const { url, method } of endpoints) {
        try {
          const options: RequestInit = {
            method,
            headers: this.getAuthHeaders(method, url.replace(this.apiUrl, ''), method === 'POST' ? { market: marketId } : undefined),
          };

          if (method === 'POST') {
            options.body = JSON.stringify({ market: marketId });
          }

          const response = await fetch(url, options);

          if (response.ok) {
            const data = await response.json();
            
            return {
              bids: data.bids?.map((b: any) => ({ 
                price: parseFloat(b.price), 
                size: parseFloat(b.size) 
              })) || [],
              asks: data.asks?.map((a: any) => ({ 
                price: parseFloat(a.price), 
                size: parseFloat(a.size) 
              })) || [],
              timestamp: Date.now(),
            };
          }
        } catch (err) {
          lastError = err as Error;
          continue; // Try next endpoint
        }
      }

      // If all endpoints failed, throw the last error
      throw lastError || new Error('Failed to fetch orderbook from all endpoints');
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
    if (!this.isEnabled()) {
      throw new Error('Polymarket trading not enabled - missing credentials');
    }

    try {
      // Create order payload
      const orderPayload = {
        market: request.marketId,
        tokenID: request.tokenId,
        side: request.side,
        size: request.size.toString(),
        price: request.price.toString(),
        expiration: request.expiration || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
        nonce: request.nonce || Date.now(),
      };

      // Sign the order
      const signature = await this.signOrder(orderPayload);

      // Submit to CLOB
      const fullPayload = {
        ...orderPayload,
        signature,
      };
      
      const response = await fetch(`${this.apiUrl}/order`, {
        method: 'POST',
        headers: this.getAuthHeaders('POST', '/order', fullPayload),
        body: JSON.stringify(fullPayload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to place order: ${error}`);
      }

      const data = await response.json();

      return {
        orderId: data.orderID || data.id,
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
    if (!this.isEnabled()) {
      throw new Error('Polymarket trading not enabled');
    }

    try {
      const response = await fetch(`${this.apiUrl}/order/${orderId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders('DELETE', `/order/${orderId}`),
      });

      return response.ok;
    } catch (error) {
      console.error('[Polymarket] Failed to cancel order:', error);
      return false;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<PolymarketOrder | null> {
    try {
      const response = await fetch(`${this.apiUrl}/order/${orderId}`, {
        headers: this.getAuthHeaders('GET', `/order/${orderId}`),
      });

      if (!response.ok) return null;

      const data = await response.json();

      return {
        orderId: data.orderID || data.id,
        marketId: data.market,
        side: data.side,
        size: parseFloat(data.originalSize || data.size),
        price: parseFloat(data.price),
        status: data.status,
        filledSize: parseFloat(data.sizeMatched || 0),
        remainingSize: parseFloat(data.sizeRemaining || data.size),
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      };
    } catch (error) {
      console.error('[Polymarket] Failed to get order status:', error);
      return null;
    }
  }

  /**
   * Sign an order (simplified - real implementation needs proper EIP-712 signing)
   */
  private async signOrder(orderPayload: any): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    // This is a simplified version. Real implementation should use EIP-712
    // structured data signing as specified by Polymarket CLOB API
    const message = JSON.stringify(orderPayload);
    const signature = await this.wallet.signMessage(message);
    
    return signature;
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
