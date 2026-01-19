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
import { trackExternalApi, trackError } from './metrics';
import { withSpan } from './tracing';

// Configure proxy for axios using HttpsProxyAgent with fallback support
const proxyUrl = process.env.POLYMARKET_PROXY_URL;
let httpsAgent: any = null;
let proxyDisabled = false; // Track if proxy is down
let proxyDisabledUntil = 0; // Timestamp when we should retry proxy

const PROXY_RETRY_INTERVAL = 5 * 60 * 1000; // Retry proxy every 5 minutes

// Browser-like headers for all Polymarket requests
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://polymarket.com',
  'Referer': 'https://polymarket.com/'
};

if (proxyUrl) {
  console.log('[Polymarket] Configuring proxy with fallback:', proxyUrl.replace(/:[^:@]+@/, ':****@'));

  try {
    httpsAgent = new HttpsProxyAgent(proxyUrl);

    // Request interceptor: add proxy agent and headers
    axios.interceptors.request.use((config) => {
      const isPolymarket =
        (config.url && config.url.includes('polymarket.com')) ||
        (config.baseURL && config.baseURL.includes('polymarket.com'));

      if (!isPolymarket) return config;

      // Always add browser headers
      config.headers = { ...config.headers, ...BROWSER_HEADERS } as any;

      // Check if we should retry the proxy
      if (proxyDisabled && Date.now() > proxyDisabledUntil) {
        console.log('[Polymarket] Retrying proxy connection...');
        proxyDisabled = false;
      }

      // Only use proxy if it's not disabled
      if (httpsAgent && !proxyDisabled) {
        Object.defineProperty(config, 'httpsAgent', {
          value: httpsAgent,
          enumerable: false,
          writable: true,
          configurable: true
        });
        config.proxy = false;
      }

      return config;
    });

    // Response interceptor: detect proxy failures and retry without proxy
    axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        const isPolymarket =
          (config?.url && config.url.includes('polymarket.com')) ||
          (config?.baseURL && config.baseURL.includes('polymarket.com'));

        // Check for proxy-specific errors
        const status = error.response?.status;
        const statusText = error.response?.statusText || '';
        const isProxyError =
          status === 407 ||
          statusText.includes('TRAFFIC_EXHAUSTED') ||
          statusText.includes('PROXY') ||
          error.code === 'ECONNREFUSED';

        // If this is a proxy error and we haven't retried yet
        if (isPolymarket && isProxyError && !config._proxyRetried && httpsAgent) {
          console.warn('[Polymarket] ⚠️ Proxy failed (', status || '', statusText || '', '), falling back to direct connection');

          // Mark proxy as disabled temporarily
          proxyDisabled = true;
          proxyDisabledUntil = Date.now() + PROXY_RETRY_INTERVAL;

          // Mark this request as retried to prevent infinite loop
          config._proxyRetried = true;

          // Remove proxy agent for retry
          delete config.httpsAgent;
          config.proxy = undefined;

          // Retry the request without proxy
          console.log('[Polymarket] Retrying request without proxy...');
          return axios.request(config);
        }

        return Promise.reject(error);
      }
    );

    console.log('[Polymarket] Proxy with fallback configured successfully');
  } catch (error) {
    console.error('[Polymarket] Failed to configure proxy:', error);
  }
} else {
  // No proxy configured - just add browser headers
  console.log('[Polymarket] No proxy configured, using direct connection');
  axios.interceptors.request.use((config) => {
    const isPolymarket =
      (config.url && config.url.includes('polymarket.com')) ||
      (config.baseURL && config.baseURL.includes('polymarket.com'));

    if (isPolymarket) {
      config.headers = { ...config.headers, ...BROWSER_HEADERS } as any;
    }
    return config;
  });
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
  // Opt optimizations to skip fetching orderbook
  tickSize?: string;
  negRisk?: boolean;
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
  tickSize?: string;
  negRisk?: boolean;
}

export interface LiquidityCheck {
  canHedge: boolean;
  availableSize: number;
  bestPrice: number;
  estimatedSlippage: number;
  reason?: string;
  tickSize?: string;
  negRisk?: boolean;
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
  private credentialsReady: boolean = false;
  private credentialsPromise: Promise<void> | null = null;

  constructor() {
    this.apiUrl = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
    this.apiKey = (process.env.POLYMARKET_API_KEY || '').trim();
    this.apiSecret = (process.env.POLYMARKET_API_SECRET || '').trim();
    this.passphrase = (process.env.POLYMARKET_PASSPHRASE || '').trim();
    this.privateKey = (process.env.MASTER_WALLET_PRIVATE_KEY || '').trim();
    this.funderAddress = (process.env.POLYMARKET_FUNDER_ADDRESS || '').trim();
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
   * Sanitize API secret (convert URL-safe Base64 to Standard)
   */
  private sanitizeSecret(secret: string): string {
    if (!secret) return secret;

    // 1. Remove all whitespace first
    secret = secret.replace(/\s+/g, '');

    // 2. Convert URL-safe base64 to standard base64
    if (secret.includes('-') || secret.includes('_')) {
      console.log('[Polymarket] Sanitizing API Secret (converting URL-safe Base64 to Standard)...');
      secret = secret.replace(/-/g, '+').replace(/_/g, '/');
    }

    // 3. Remove any other invalid characters (keep only standard Base64 chars)
    secret = secret.replace(/[^A-Za-z0-9+/=]/g, '');

    // 4. Fix padding strictly
    while (secret.length % 4) {
      secret += '=';
    }

    return secret;
  }

  /**
   * Initialize the Polymarket CLOB client
   * First tries using provided API credentials from env, then falls back to deriving
   */
  private initializeClient() {
    if (!this.wallet) return;

    // signatureType: 1 = magic/email/proxy, 0 = direct EOA.
    // If we have a funder address (Proxy), we MUST use signatureType 1.
    const signatureType = this.funderAddress ? 1 : 0;

    console.log('[Polymarket] Initializing CLOB client (Chain ID:', this.chainId, ', SigType:', signatureType, ')');

    // Try to use provided credentials from env vars first
    const hasProvidedCreds = this.apiKey && this.apiSecret && this.passphrase;

    if (hasProvidedCreds) {
      console.log('[Polymarket] Using provided API credentials from environment...');
      const sanitizedSecret = this.sanitizeSecret(this.apiSecret);

      try {
        this.clobClient = new ClobClient(
          this.apiUrl,
          this.chainId,
          this.wallet as any,
          {
            key: this.apiKey,
            secret: sanitizedSecret,
            passphrase: this.passphrase,
          },
          signatureType,
          this.funderAddress || undefined
        );

        this.credentialsReady = true;
        console.log('[Polymarket] ✓ CLOB Client initialized with provided credentials');
        return;
      } catch (error) {
        console.error('[Polymarket] Failed to initialize with provided credentials:', error);
        console.log('[Polymarket] Falling back to credential derivation...');
      }
    }

    // Fall back to deriving credentials
    try {
      const tempClient = new ClobClient(
        this.apiUrl,
        this.chainId,
        this.wallet as any,
        undefined, // No creds yet
        signatureType,
        this.funderAddress || undefined
      );

      this.clobClient = tempClient;
      this.credentialsPromise = this.deriveAndUpgradeCredentials(signatureType);

      console.log('[Polymarket] CLOB Client initialized (credentials being derived...)');
    } catch (error) {
      console.error('[Polymarket] Failed to initialize CLOB client:', error);
      this.clobClient = null;
    }
  }

  /**
   * Derive API credentials and upgrade the CLOB client
   */
  private async deriveAndUpgradeCredentials(signatureType: number): Promise<void> {
    if (!this.wallet || !this.clobClient) return;

    try {
      console.log('[Polymarket] Deriving API credentials from wallet...');

      // createOrDeriveApiKey returns credentials tied to the SIGNER wallet
      const derivedCreds = await this.clobClient.createOrDeriveApiKey();
      const creds = derivedCreds as any;
      const key = creds.apiKey || creds.key;

      if (!creds || !key) {
        console.error('[Polymarket] Failed to derive API credentials - empty response');
        return;
      }

      console.log('[Polymarket] ✓ API credentials derived successfully');
      console.log('[Polymarket]   API Key:', key.substring(0, 12), '...');

      // Create a new client with the derived credentials
      this.clobClient = new ClobClient(
        this.apiUrl,
        this.chainId,
        this.wallet as any,
        {
          key: key,
          secret: creds.secret,
          passphrase: creds.passphrase,
        },
        signatureType,
        this.funderAddress || undefined
      );

      this.credentialsReady = true;
      console.log('[Polymarket] ✓ CLOB Client upgraded with derived credentials');
    } catch (error) {
      console.error('[Polymarket] Failed to derive API credentials:', error);
      // Keep the temp client - it may still work for some operations
    }
  }

  /**
   * Wait for credentials to be ready before trading
   */
  async ensureReady(): Promise<boolean> {
    if (this.credentialsReady) return true;
    if (this.credentialsPromise) {
      await this.credentialsPromise;
      return this.credentialsReady;
    }
    return false;
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
    const start = Date.now();
    if (!this.clobClient) {
      throw new Error('Polymarket trading not initialized');
    }

    try {
      const ob = await this.clobClient.getOrderBook(marketId);

      const result = {
        bids:
          ob.bids?.map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
          })).sort((a, b) => b.price - a.price) || [], // Sort Bids DESC (Best/High first)
        asks:
          ob.asks?.map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
          })).sort((a, b) => a.price - b.price) || [], // Sort Asks ASC (Best/Low first)
        timestamp: Date.now(),
        tickSize: (ob as any).tick_size,
        negRisk: ob.neg_risk
      };
      trackExternalApi('polymarket', 'get_orderbook', Date.now() - start, true);
      return result;
    } catch (error: any) {
      console.error('[Polymarket] Failed to fetch orderbook:', error);
      trackExternalApi('polymarket', 'get_orderbook', Date.now() - start, false);
      trackError(error, { context: 'polymarket-orderbook', marketId });
      throw error;
    }
  }

  /**
   * Get YES and NO token IDs for a binary market using condition ID
   */
  async getMarketTokens(conditionId: string): Promise<{
    yesTokenId: string;
    noTokenId: string;
  }> {
    if (!this.clobClient) {
      throw new Error('Polymarket trading not initialized');
    }

    try {
      const market = await this.clobClient.getMarket(conditionId);
      const tokens = (market as any).tokens || [];

      if (tokens.length !== 2) {
        throw new Error(`Expected 2 tokens for binary market, got ${tokens.length}`);
      }

      // Tokens are typically ordered [YES, NO] but let's check the outcome field
      const yesToken = tokens.find((t: any) => t.outcome?.toUpperCase() === 'YES');
      const noToken = tokens.find((t: any) => t.outcome?.toUpperCase() === 'NO');

      if (!yesToken || !noToken) {
        // Fallback: assume first is YES, second is NO
        console.warn('[Polymarket] Could not determine YES/NO from outcome field, using order');
        return {
          yesTokenId: tokens[0].token_id,
          noTokenId: tokens[1].token_id
        };
      }

      return {
        yesTokenId: yesToken.token_id,
        noTokenId: noToken.token_id
      };
    } catch (error) {
      console.error('[Polymarket] Failed to fetch market tokens:', error);
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
        console.log('[Polymarket-Liquidity] Level: price=', level.price, ', size=', level.size, '| Filling', fillSize);
        totalCost += fillSize * level.price;
        remainingSize -= fillSize;
      }

      const filledSize = size - remainingSize;
      const avgPrice = filledSize > 0 ? totalCost / filledSize : 0;

      // Calculate slippage in basis points
      const slippage = Math.abs((avgPrice - bestPrice) / bestPrice) * 10000;

      console.log('[Polymarket-Liquidity] Summary: Top-of-book=', bestPrice, ', Avg execution=', avgPrice.toFixed(4), ', Slippage=', slippage.toFixed(0), 'bps');

      const canHedge = filledSize >= size * 0.95 && slippage <= maxSlippageBps;

      return {
        canHedge,
        availableSize: filledSize,
        bestPrice: avgPrice,
        estimatedSlippage: slippage,
        reason: !canHedge
          ? `Insufficient liquidity or high slippage (${slippage.toFixed(0)}bps > ${maxSlippageBps}bps)`
          : undefined,
        tickSize: orderbook.tickSize,
        negRisk: orderbook.negRisk
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
    const start = Date.now();
    if (!this.clobClient || !this.wallet) {
      throw new Error('Polymarket trading not enabled - missing credentials');
    }

    // Wait for credentials to be ready
    const ready = await this.ensureReady();
    if (!ready) {
      throw new Error('Polymarket credentials not ready - failed to derive API key');
    }

    try {
      let tickSize: TickSize | undefined;
      let negRisk = false;

      // Use provided optimization params if active, otherwise fetch
      if (request.tickSize !== undefined && request.negRisk !== undefined) {
        tickSize = request.tickSize as TickSize;
        negRisk = request.negRisk;
      } else {
        // Fetch orderbook to derive tick size / neg risk
        console.log('[Polymarket] Fetching orderbook for config (token:', request.tokenId, ')');
        const ob = await this.clobClient.getOrderBook(request.tokenId);
        tickSize = (ob as any).tick_size ?? undefined;
        negRisk = ob.neg_risk ?? false;
      }

      console.log('[Polymarket] Placing order for token', request.tokenId, '(Price:', request.price, ', Size:', request.size, ')');

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
      // Validate response - CLOB client may return empty/invalid response on 403/blocked requests
      // IMPORTANT: Polymarket may return an ID but fail later, or return a response without explicit ID if blocked
      const orderId = orderResponse?.orderID || orderResponse?.id;

      // If we don't get an order ID, check if it's because of a Cloudflare block or API error
      if (!orderId) {
        const responseStr = JSON.stringify(orderResponse);
        console.error('[Polymarket] Invalid order response:', responseStr);

        // Check for specific error types
        if (responseStr.includes('<!DOCTYPE html>')) {
          throw new Error('Polymarket API rejected order - Cloudflare blocked request');
        }

        // Check for 401 Unauthorized / Invalid API Key
        if (responseStr.includes('Unauthorized') || responseStr.includes('Invalid api key')) {
          throw new Error('Polymarket API rejected order - Unauthorized (Invalid API Key/Secret/Passphrase)');
        }

        // Check for min size error
        if (responseStr.includes('min size: $1')) {
          throw new Error('Polymarket API rejected order - Order value below $1.00 minimum after rounding');
        }

        throw new Error(`Polymarket API rejected order - no order ID returned. Response: ${responseStr.substring(0, 200)}...`);
      }

      console.log('[Polymarket] Order placed successfully:', orderId);

      const result: PolymarketOrder = {
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
      trackExternalApi('polymarket', 'place_order', Date.now() - start, true);
      return result;
    } catch (error: any) {
      // detailed error logging for proxy debugging
      if (error.response) {
        console.error('[Polymarket] Order failed with status', error.response.status, ':', error.response.statusText);
        if (error.response.status === 403) {
          console.error('[Polymarket] 🚫 CLOUDFLARE BLOCK DETECTED - Try changing Proxy Country (Non-US)');
        }
      }
      console.error('[Polymarket] Failed to place order:', error);
      trackExternalApi('polymarket', 'place_order', Date.now() - start, false);
      trackError(error, { context: 'polymarket-place-order', marketId: request.marketId });
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
      // OPTIMIZATION: Pass already fetched tickSize/negRisk to avoid redundant API call
      tickSize: (orderbook as any).tickSize,
      negRisk: (orderbook as any).negRisk
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
    const start = Date.now();
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

      const result: PolymarketOrder = {
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

      trackExternalApi('polymarket', 'get_order_status', Date.now() - start, true);
      return result;
    } catch (error: any) {
      console.error('[Polymarket] Failed to get order status:', error);
      trackExternalApi('polymarket', 'get_order_status', Date.now() - start, false);
      trackError(error, { context: 'polymarket-status', orderId });
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
          console.log('[Polymarket] Order', orderId, 'partially filled:', order.filledSize, '/', order.size);
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
  /**
   * Get market details
   */
  async getMarket(marketId: string): Promise<any> {
    if (!this.clobClient) return null;
    try {
      await this.ensureReady();
      return await this.clobClient.getMarket(marketId);
    } catch (error) {
      console.error('[Polymarket] Failed to get market:', error);
      return null;
    }
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(): Promise<any[]> {
    if (!this.clobClient) return [];
    try {
      await this.ensureReady();
      // Use "any" cast because the SDK types might be restrictive/outdated
      const response = await (this.clobClient as any).getOpenOrders({ next_cursor: '' });
      // Depending on SDK version, it returns array directly or {data: [], next_cursor}
      return Array.isArray(response) ? response : (response?.data || []);
    } catch (error) {
      console.error('[Polymarket] Failed to get open orders:', error);
      return [];
    }
  }

  /**
   * Get recent trades
   */
  async getTrades(): Promise<any[]> {
    if (!this.clobClient) return [];
    try {
      await this.ensureReady();
      const response = await (this.clobClient as any).getTrades({ next_cursor: '' });
      return Array.isArray(response) ? response : (response?.data || []);
    } catch (error) {
      console.error('[Polymarket] Failed to get trades:', error);
      return [];
    }
  }
}


// Singleton pattern for dev mode persistence
const globalForPolymarket = global as unknown as { polymarketTrading: PolymarketTradingService };

export const polymarketTrading = globalForPolymarket.polymarketTrading || new PolymarketTradingService();

if (process.env.NODE_ENV !== 'production') {
  globalForPolymarket.polymarketTrading = polymarketTrading;
}

// Helper function to estimate fees
export function estimatePolymarketFees(size: number, price: number): number {
  // Polymarket typically charges ~2% fee
  const tradingFee = size * price * 0.02;
  // Approximate gas cost on Polygon (very cheap now, ~$0.005 per tx)
  const gasCost = 0.005;

  return tradingFee + gasCost;
}
