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
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Configure proxy for axios using HttpsProxyAgent
const proxyUrl = process.env.POLYMARKET_PROXY_URL;
let httpsAgent: any = null;

if (proxyUrl) {
  console.log('[Polymarket] Configuring proxy:', proxyUrl.replace(/:[^:@]+@/, ':****@'));

  try {
    httpsAgent = new HttpsProxyAgent(proxyUrl);

    // Use axios interceptor to add the agent and browser-like headers
    axios.interceptors.request.use((config) => {
      // Check both url and baseURL to enable proxy for clob-client (which uses baseURL)
      const isPolymarket =
        (config.url && config.url.includes('polymarket.com')) ||
        (config.baseURL && config.baseURL.includes('polymarket.com'));

      if (httpsAgent && isPolymarket) {
        // Use Object.defineProperty to make httpsAgent non-enumerable
        // This prevents "Converting circular structure to JSON" errors when axios/clob-client logs errors
        Object.defineProperty(config, 'httpsAgent', {
          value: httpsAgent,
          enumerable: false,
          writable: true,
          configurable: true
        });

        config.proxy = false; // Disable axios native proxy, use our agent

        // Add browser-like headers to bypass Cloudflare POST blocking
        config.headers = {
          ...config.headers,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://polymarket.com',
          'Referer': 'https://polymarket.com/'
        } as any;
      }
      return config;
    });

    console.log('[Polymarket] Proxy agent configured successfully');
  } catch (error) {
    console.error('[Polymarket] Failed to configure proxy:', error);
  }
}

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
  private funderAddress: string;
  private wallet: Wallet | null = null;
  private chainId: number;
  private clobClient: ClobClient | null = null;

  constructor() {
    this.apiUrl = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
    this.apiKey = process.env.POLYMARKET_API_KEY || '';
    this.apiSecret = process.env.POLYMARKET_API_SECRET || '';
    this.passphrase = process.env.POLYMARKET_PASSPHRASE || '';
    this.privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    this.funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS || '';
    this.chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137');

    if (this.privateKey && this.privateKey !== 'YOUR_PRIVATE_KEY_HERE') {
      try {
        const rawWallet = new Wallet(this.privateKey);
        // Create ethers v5 compatibility wrapper
        // Polymarket CLOB client expects v5's _signTypedData, but v6 uses signTypedData
        this.wallet = this.wrapWalletForV5Compat(rawWallet);
      } catch (error) {
        console.error('[Polymarket] Failed to initialize wallet:', error);
      }
    }

    this.initializeClient();
  }

  /**
   * Wrap an ethers v6 wallet with v5 compatibility methods
   */
  private wrapWalletForV5Compat(wallet: Wallet): Wallet {
    const wrappedWallet = wallet as any;

    // Add ethers v5 _signTypedData method that delegates to v6 signTypedData
    if (!wrappedWallet._signTypedData && wrappedWallet.signTypedData) {
      wrappedWallet._signTypedData = function (
        domain: any,
        types: any,
        value: any
      ): Promise<string> {
        return this.signTypedData(domain, types, value);
      };
    }

    return wrappedWallet as Wallet;
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

      // signatureType: 1 = magic/email/proxy, 0 = direct EOA.
      // If we have a funder address (Proxy), we MUST use signatureType 1.
      const signatureType = this.funderAddress ? 1 : 0;

      // Wallet is now wrapped with v5 compatibility
      this.clobClient = new ClobClient(
        this.apiUrl,
        this.chainId,
        this.wallet as any,
        creds,
        signatureType,
        this.funderAddress || undefined
      );
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

      console.log(`[Polymarket] Placing order for token ${request.tokenId} (Price: ${request.price}, Size: ${request.size})`);

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

      // Validate response - CLOB client may return empty/invalid response on 403/blocked requests
      const orderId = orderResponse?.orderID || orderResponse?.id;
      if (!orderId) {
        console.error('[Polymarket] Invalid order response:', orderResponse);
        throw new Error('Polymarket API rejected order - no order ID returned (possible Cloudflare block)');
      }

      console.log(`[Polymarket] Order placed successfully: ${orderId}`);

      return {
        orderId,
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
    } catch (error: any) {
      // detailed error logging for proxy debugging
      if (error.response) {
        console.error(`[Polymarket] Order failed with status ${error.response.status}:`, error.response.statusText);
        if (error.response.status === 403) {
          console.error('[Polymarket] 🚫 CLOUDFLARE BLOCK DETECTED - Try changing Proxy Country (Non-US)');
        }
      }
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
    // Get current orderbook using tokenId (not marketId - CLOB requires token ID)
    const orderbook = await this.getOrderbook(tokenId);

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

  /**
   * Wait for order fill with timeout and polling
   * Polls Polymarket API for order status until filled, partially filled, cancelled, or timeout
   */
  async waitForOrderFill(
    orderId: string,
    timeoutMs: number = 30000,
    pollIntervalMs: number = 1000
  ): Promise<{
    filled: boolean;
    filledSize: number;
    avgPrice: number;
    status: 'FILLED' | 'PARTIAL' | 'TIMEOUT' | 'CANCELLED' | 'ERROR';
    remainingSize: number;
  }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const order = await this.getOrderStatus(orderId);

        if (!order) {
          // Order not found - might be processing, continue polling
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          continue;
        }

        // Check if order is fully filled
        if (order.status === 'MATCHED' || order.filledSize >= order.size * 0.99) {
          return {
            filled: true,
            filledSize: order.filledSize,
            avgPrice: order.price,
            status: 'FILLED',
            remainingSize: 0,
          };
        }

        // Check if order was cancelled
        if (order.status === 'CANCELLED') {
          return {
            filled: order.filledSize > 0,
            filledSize: order.filledSize,
            avgPrice: order.price,
            status: order.filledSize > 0 ? 'PARTIAL' : 'CANCELLED',
            remainingSize: order.remainingSize,
          };
        }

        // Check if partially filled (more than 50%)
        if (order.filledSize > order.size * 0.5) {
          console.log(`[Polymarket] Order ${orderId} partially filled: ${order.filledSize}/${order.size}`);
        }

        // Still open, continue polling
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        console.error('[Polymarket] Error polling order status:', error);
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    // Timeout reached - check final status
    try {
      const finalOrder = await this.getOrderStatus(orderId);
      if (finalOrder) {
        return {
          filled: finalOrder.filledSize >= finalOrder.size * 0.99,
          filledSize: finalOrder.filledSize,
          avgPrice: finalOrder.price,
          status: finalOrder.filledSize > 0 ? 'PARTIAL' : 'TIMEOUT',
          remainingSize: finalOrder.remainingSize,
        };
      }
    } catch {
      // Ignore final check error
    }

    return {
      filled: false,
      filledSize: 0,
      avgPrice: 0,
      status: 'TIMEOUT',
      remainingSize: 0,
    };
  }
}


// Export singleton instance
export const polymarketTrading = new PolymarketTradingService();

// Helper function to estimate fees
export function estimatePolymarketFees(size: number, price: number): number {
  // Polymarket typically charges ~2% fee
  const tradingFee = size * price * 0.02;
  // Approximate gas cost on Polygon (very cheap now, ~$0.005 per tx)
  const gasCost = 0.005;

  return tradingFee + gasCost;
}
