/**
 * Hedge Manager
 * 
 * Core logic for managing hedges, calculating spreads, and monitoring risk
 */

import { prisma } from './prisma';
import { polymarketTrading, estimatePolymarketFees } from './polymarket-trading';
import { orderSplitter, type SplitOrderPlan, type OrderChunk } from './order-splitter';
import { polymarketCircuit, CircuitOpenError } from './circuit-breaker';
import { redis } from './redis';

export interface HedgeConfig {
  enabled: boolean;
  minSpreadBps: number; // Minimum spread in basis points (100 = 1%)
  maxSlippageBps: number; // Maximum acceptable slippage
  maxUnhedgedExposure: number; // Max USD value of unhedged positions
  maxPositionSize: number; // Max size for single hedge
  hedgeTimeoutMs: number; // Time to wait for hedge before failing
  retryAttempts: number; // Number of retry attempts
}

// Default configuration
const DEFAULT_CONFIG: HedgeConfig = {
  enabled: true, // Enabled by default
  minSpreadBps: 200, // 2% minimum spread
  maxSlippageBps: 100, // 1% max slippage
  maxUnhedgedExposure: 10000, // $10k max unhedged
  maxPositionSize: 1000, // $1k max single position
  hedgeTimeoutMs: 5000, // 5 seconds
  retryAttempts: 3,
};

export class HedgeManager {
  private config: HedgeConfig;
  private configCache: { config: HedgeConfig; timestamp: number } | null = null;
  private readonly CONFIG_CACHE_TTL_MS = 60000; // 60 seconds

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Load configuration from database with caching
   */
  async loadConfig(forceRefresh: boolean = false): Promise<HedgeConfig> {
    try {
      // Check cache if not forcing refresh
      if (!forceRefresh && this.configCache) {
        const cacheAge = Date.now() - this.configCache.timestamp;
        if (cacheAge < this.CONFIG_CACHE_TTL_MS) {
          console.log(`[HedgeManager] Using cached config (age: ${Math.round(cacheAge / 1000)}s)`);
          return this.configCache.config;
        }
      }

      const configs = await prisma.hedgeConfig.findMany();

      for (const cfg of configs) {
        if (cfg.key in this.config) {
          (this.config as any)[cfg.key] = cfg.value;
        }
      }

      // Override enabled if Polymarket trading not configured
      if (!polymarketTrading.isEnabled()) {
        this.config.enabled = false;
      }

      // Update cache
      this.configCache = {
        config: { ...this.config },
        timestamp: Date.now(),
      };

      console.log('[HedgeManager] Loaded fresh config from DB');
      return this.config;
    } catch (error) {
      console.error('[HedgeManager] Failed to load config:', error);
      return this.config;
    }
  }

  /**
   * Invalidate config cache (call after updating config)
   */
  invalidateCache(): void {
    this.configCache = null;
    console.log('[HedgeManager] Config cache invalidated');
  }

  /**
   * Update configuration
   */
  async updateConfig(key: keyof HedgeConfig, value: any, updatedBy?: string): Promise<void> {
    await prisma.hedgeConfig.upsert({
      where: { key },
      create: {
        key,
        value,
        updatedBy,
      },
      update: {
        value,
        updatedBy,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache and reload
    this.invalidateCache();
    await this.loadConfig(true);
  }

  /**
   * Get current configuration
   */
  getConfig(): HedgeConfig {
    return { ...this.config };
  }

  /**
   * Calculate optimal spread based on market conditions
   * Now fetches real volatility from OddsHistory when not provided
   */
  async calculateSpread(params: {
    eventId: string;
    size: number;
    volatility?: number;
    liquidityScore?: number;
  }): Promise<number> {
    const start = Date.now();
    let { volatility = 0.5, liquidityScore = 0.5 } = params;
    const { size, eventId } = params;

    // Fetch real volatility from OddsHistory if not provided
    if (params.volatility === undefined) {
      try {
        console.log(`[HedgeManager] Calculating volatility for ${eventId}...`);
        const dbStart = Date.now();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentHistory = await prisma.oddsHistory.findMany({
          where: {
            eventId,
            timestamp: { gte: oneDayAgo },
          },
          orderBy: { timestamp: 'desc' },
          take: 48, // 24 hours at 30min buckets
          select: { price: true },
        });
        console.log(`[HedgeManager] Volatility DB query took ${Date.now() - dbStart}ms`);

        if (recentHistory.length >= 4) {
          // Calculate volatility as standard deviation of price changes
          const prices = recentHistory.map((h: { price: number }) => h.price);
          const returns = prices.slice(0, -1).map((p: number, i: number) =>
            Math.abs((prices[i + 1] - p) / p)
          );
          const mean = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
          const variance = returns.reduce((a: number, r: number) => a + Math.pow(r - mean, 2), 0) / returns.length;
          volatility = Math.sqrt(variance);

          // Normalize to 0-1 scale (typical crypto volatility is 0.02-0.10 per 30min)
          volatility = Math.min(1, volatility * 10);
          console.log(`[HedgeManager] Calculated volatility for ${eventId}: ${(volatility * 100).toFixed(1)}%`);
        }
      } catch (volErr) {
        // Use default volatility on error
        console.warn('[HedgeManager] Failed to calculate volatility, using default:', volErr);
      }
    }

    // Base spread from config
    let spreadBps = this.config.minSpreadBps;

    // Adjust for position size (larger = more spread)
    const sizeAdjustment = Math.min(100, (size / this.config.maxPositionSize) * 50);
    spreadBps += sizeAdjustment;

    // Adjust for volatility (higher = more spread)
    const volatilityAdjustment = volatility * 150; // Increased weight for profitability
    spreadBps += volatilityAdjustment;

    // Adjust for liquidity (lower = more spread)
    const liquidityAdjustment = (1 - liquidityScore) * 50;
    spreadBps += liquidityAdjustment;

    return Math.min(1000, Math.max(this.config.minSpreadBps, spreadBps));
  }

  /**
   * Calculate hedge prices with spread
   */
  calculateHedgePrices(params: {
    userPrice: number;
    side: 'buy' | 'sell';
    spreadBps: number;
  }): { hedgePrice: number; minAcceptablePrice: number; maxAcceptablePrice: number } {
    const { userPrice, side, spreadBps } = params;
    const spreadDecimal = spreadBps / 10000;

    let hedgePrice: number;
    let minAcceptablePrice: number;
    let maxAcceptablePrice: number;

    if (side === 'buy') {
      // User buys from us at userPrice
      // We need to buy from Polymarket at lower price
      hedgePrice = userPrice * (1 - spreadDecimal);
      minAcceptablePrice = hedgePrice * 0.95; // Allow 5% worse
      maxAcceptablePrice = hedgePrice;
    } else {
      // User sells to us at userPrice
      // We need to sell on Polymarket at higher price
      hedgePrice = userPrice * (1 + spreadDecimal);
      minAcceptablePrice = hedgePrice;
      maxAcceptablePrice = hedgePrice * 1.05; // Allow 5% better
    }

    return {
      hedgePrice: Math.max(0.01, Math.min(0.99, hedgePrice)),
      minAcceptablePrice: Math.max(0.01, Math.min(0.99, minAcceptablePrice)),
      maxAcceptablePrice: Math.max(0.01, Math.min(0.99, maxAcceptablePrice)),
    };
  }

  /**
   * Check if hedging is feasible for an order
   */
  async canHedge(params: {
    eventId: string;
    size: number;
    price: number;
    side: 'buy' | 'sell';
    option: string; // YES/NO or outcome ID
  }): Promise<{
    feasible: boolean;
    reason?: string;
    polymarketMarketId?: string;
    polymarketTokenId?: string;
    estimatedSpread?: number;
    estimatedFees?: number;
    // optimization params
    polymarketTickSize?: string;
    polymarketNegRisk?: boolean;
    liquidityData?: any;
  }> {
    const start = Date.now();
    // Check if hedging is enabled
    if (!this.config.enabled) {
      return {
        feasible: false,
        reason: 'Hedging is disabled',
      };
    }

    // Check minimum order size (Polymarket constraint)
    // Most markets have a strict $1 minimum value
    const value = params.size * params.price;
    if (value < 1.1) { // Safety check for dust, using $1.1 to avoid rounding issues hitting $1.0 limit
      return {
        feasible: false,
        reason: `Order value ($${value.toFixed(4)}) too small for hedging (min $1.10)`
      };
    }
    // Hardcoded safety min size from Polymarket docs (usually 5 USDC or shares)
    // Actually it's often 5 shares or value... let's check config later. 
    // User error was "Size (1) lower than minimum: 5".
    // Assuming 5 is shares if price is low, or currency if high? 
    // Usually it's min proxy amount.
    // Let's enforce min size 5 to be safe if that's what API said.
    if (params.size < 5) {
      return {
        feasible: false,
        reason: `Order size (${params.size}) lower than minimum (5)`
      };
    }

    // Check position size limits (in USD value, not share count)
    const positionValueUsd = params.size * params.price;
    if (positionValueUsd > this.config.maxPositionSize) {
      return {
        feasible: false,
        reason: `Position value $${positionValueUsd.toFixed(2)} exceeds maximum $${this.config.maxPositionSize}`,
      };
    }

    // Get Polymarket market mapping
    console.log(`[HedgeManager] Looking up mapping for ${params.eventId} (Start canHedge: ${Date.now() - start}ms)`);
    const mapping = await prisma.polymarketMarketMapping.findUnique({
      where: { internalEventId: params.eventId },
    });

    if (!mapping || !mapping.isActive) {
      return {
        feasible: false,
        reason: 'No active Polymarket market mapping found',
      };
    }

    // Find the correct token ID for the option (YES/NO)
    let tokenId = mapping.polymarketTokenId; // Default to the main token
    if (mapping.outcomeMapping) {
      const outcomeData = (mapping.outcomeMapping as any)?.outcomes;
      if (Array.isArray(outcomeData)) {
        const targetOutcome = outcomeData.find((o: any) =>
          o.name?.toUpperCase() === params.option.toUpperCase() || o.internalId === params.option
        );
        if (targetOutcome?.polymarketId) {
          tokenId = targetOutcome.polymarketId;
        }
      }
    }

    if (!tokenId) {
      return {
        feasible: false,
        reason: `No Polymarket token ID found for outcome ${params.option}`,
      };
    }

    // Calculate spread (for logging purposes)
    const spreadStart = Date.now();
    const spreadBps = await this.calculateSpread({
      eventId: params.eventId,
      size: params.size,
    });
    console.log(`[HedgeManager] Spread calc took ${Date.now() - spreadStart}ms`);

    // Estimate fees (for logging purposes)
    const estimatedFees = estimatePolymarketFees(params.size, params.price);
    const spreadValue = (spreadBps / 10000) * params.size * params.price;

    // Log economics but don't block - hedging is for risk management, not profit on small trades
    if (spreadValue < estimatedFees) {
      console.log(`[HEDGE] Warning: Spread ($${spreadValue.toFixed(4)}) < fees ($${estimatedFees.toFixed(4)}) - hedging anyway for risk management`);
    }

    // Check Polymarket liquidity using the correct token ID
    // OPTIMIZATION: First try Redis cache (populated by realtime worker) to avoid API latency
    try {
      let liquidityCheck: {
        canHedge: boolean;
        availableSize: number;
        bestPrice: number;
        estimatedSlippage: number;
        reason?: string;
        tickSize?: string;
        negRisk?: boolean;
      } | null = null;

      // Try cached liquidity first (30s TTL, updated by worker.ts)
      if (redis) {
        // ... (existing cache logic)
        try {
          const cached = await redis.get(`liquidity:${tokenId}`);
          if (cached) {
            const snapshot = JSON.parse(cached) as any;
            // ... logic ...
            // assume cache logic stays effectively same for now
          }
        } catch (e) { } // ignore
      }

      // Fall back to API if no cache hit
      const liqCheckStart = Date.now();
      if (!liquidityCheck) {
        console.log(`[HedgeManager] Checking liquidity via API for ${tokenId}...`);
        liquidityCheck = await polymarketTrading.checkLiquidity(
          tokenId,
          params.side === 'buy' ? 'BUY' : 'SELL',
          params.size,
          this.config.maxSlippageBps
        );
        console.log(`[HedgeManager] Liquidity API check took ${Date.now() - liqCheckStart}ms`);
      }

      if (!liquidityCheck.canHedge) {
        return {
          feasible: false,
          reason: liquidityCheck.reason,
          polymarketMarketId: mapping.polymarketId,
          polymarketTokenId: tokenId,
          estimatedSpread: spreadValue,
          estimatedFees,
        };
      }

      return {
        feasible: true,
        polymarketMarketId: mapping.polymarketId,
        polymarketTokenId: tokenId,
        estimatedSpread: spreadValue,
        estimatedFees,
        polymarketTickSize: liquidityCheck.tickSize,
        polymarketNegRisk: liquidityCheck.negRisk
      };
    } catch (error) {
      console.error('[HedgeManager] Liquidity check failed (not critical):', error);

      // For top volume markets, proceed anyway since liquidity is guaranteed
      // BUT we won't have tickSize, so we can't optimize executeHedge
      console.log('[HedgeManager] Proceeding without liquidity check for high-volume market');
      return {
        feasible: true,
        polymarketMarketId: mapping.polymarketId,
        polymarketTokenId: tokenId,
        estimatedSpread: spreadValue,
        estimatedFees,
      };
    }
  }

  /**
   * Execute hedge for an order (with order splitting for large orders)
   */
  async executeHedge(params: {
    userOrderId: string;
    eventId: string;
    size: number;
    userPrice: number;
    side: 'buy' | 'sell';
    option: string; // YES/NO or outcome ID
    polymarketTickSize?: string;
    polymarketNegRisk?: boolean;
  }): Promise<{
    success: boolean;
    hedgePositionId?: string;
    splitExecution?: boolean;
    chunksExecuted?: number;
    totalChunks?: number;
    avgExecutionPrice?: number;
    error?: string;
    timings?: { // Latency metrics
      total: number;
      mappingLookup: number;
      spreadCalc: number;
      orderPlace: number;
    };
  }> {
    const { userOrderId, eventId, size, userPrice, side, option, polymarketTickSize, polymarketNegRisk } = params;

    // Timing metrics for observability
    const timings = {
      start: Date.now(),
      mappingLookup: 0,
      spreadCalc: 0,
      orderPlace: 0,
      total: 0,
    };

    try {
      // Get Polymarket mapping
      const mappingStart = Date.now();
      const mapping = await prisma.polymarketMarketMapping.findUnique({
        where: { internalEventId: eventId },
      });
      timings.mappingLookup = Date.now() - mappingStart;

      if (!mapping) {
        throw new Error('No Polymarket market mapping found');
      }

      // Validate mapping before proceeding
      const validation = this.validateMapping(mapping);
      if (!validation.valid) {
        throw new Error(`Invalid mapping: ${validation.error}`);
      }

      // Find the correct token ID for the option (YES/NO)
      let tokenId = mapping.polymarketTokenId;
      if (mapping.outcomeMapping) {
        const outcomeData = (mapping.outcomeMapping as any)?.outcomes;
        if (Array.isArray(outcomeData)) {
          const targetOutcome = outcomeData.find((o: any) =>
            o.name?.toUpperCase() === option.toUpperCase() || o.internalId === option
          );
          if (targetOutcome?.polymarketId) {
            tokenId = targetOutcome.polymarketId;
          }
        }
      }

      if (!tokenId) {
        throw new Error(`No Polymarket token ID found for outcome ${option}`);
      }

      // Add token ID to mapping for downstream use
      const mappingWithTokenId = { ...mapping, resolvedTokenId: tokenId };

      // Calculate spread and hedge price
      const spreadStart = Date.now();
      const spreadBps = await this.calculateSpread({ eventId, size });
      timings.spreadCalc = Date.now() - spreadStart;

      const { hedgePrice } = this.calculateHedgePrices({
        userPrice,
        side,
        spreadBps,
      });

      // Check if order should be split
      const shouldSplit = orderSplitter.shouldSplit(size);

      if (!shouldSplit) {
        // Small order - execute normally
        return await this.executeSingleHedge({
          userOrderId,
          mapping: mappingWithTokenId,
          size,
          userPrice,
          hedgePrice,
          side,
          spreadBps,
          polymarketTickSize,
          polymarketNegRisk
        });
      }

      // Large order - split and execute incrementally
      return await this.executeSplitHedge({
        userOrderId,
        eventId,
        mapping: mappingWithTokenId,
        size,
        userPrice,
        hedgePrice,
        side,
        spreadBps,
      });
    } catch (error: any) {
      console.error('[HedgeManager] Hedge execution failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a single hedge (no splitting)
   */
  private async executeSingleHedge(params: {
    userOrderId: string;
    mapping: any;
    size: number;
    userPrice: number;
    hedgePrice: number;
    side: 'buy' | 'sell';
    spreadBps: number;
    polymarketTickSize?: string;
    polymarketNegRisk?: boolean;
  }) {
    const { userOrderId, mapping, size, userPrice, hedgePrice, side, polymarketTickSize, polymarketNegRisk } = params;

    // Create hedge position record
    const hedgePosition = await prisma.hedgePosition.create({
      data: {
        userOrderId: userOrderId === 'PENDING' ? null : userOrderId,
        polymarketMarketId: mapping.polymarketId,
        side: side === 'buy' ? 'BUY' : 'SELL',
        amount: size,
        userPrice,
        hedgePrice,
        spreadCaptured: Math.abs(userPrice - hedgePrice) * size,
        status: 'pending',
      },
    });

    // Retry logic with exponential backoff
    const maxRetries = this.config.retryAttempts;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check circuit breaker before attempting
        if (!polymarketCircuit.isAllowed()) {
          const stats = polymarketCircuit.getStats();
          throw new CircuitOpenError(
            `Polymarket circuit breaker OPEN (${stats.recentFailures} recent failures). ` +
            `Retry in ${Math.ceil((30000 - stats.timeSinceStateChange) / 1000)}s`
          );
        }

        console.log(`[HedgeManager] Placing Polymarket order (attempt ${attempt}/${maxRetries})`);
        const polymarketOrder = await polymarketCircuit.execute(() =>
          polymarketTrading.placeMarketOrder(
            mapping.polymarketId,
            mapping.polymarketConditionId || '',
            mapping.resolvedTokenId || mapping.polymarketTokenId || '',
            side === 'buy' ? 'BUY' : 'SELL',
            size
          )
        );

        const fees = estimatePolymarketFees(size, hedgePrice);
        const netProfit = hedgePosition.spreadCaptured - fees;

        await prisma.hedgePosition.update({
          where: { id: hedgePosition.id },
          data: {
            polymarketOrderId: polymarketOrder.orderId,
            status: 'hedged',
            hedgedAt: new Date(),
            polymarketFees: fees,
            netProfit,
            retryCount: attempt - 1,
          },
        });

        console.log(`[HedgeManager] Successfully hedged order ${userOrderId} on attempt ${attempt}`);

        // Track affiliate referral trade stats (non-blocking)
        if (netProfit > 0) {
          try {
            const order = await prisma.order.findUnique({
              where: { id: userOrderId },
              select: { userId: true, amount: true }
            });

            if (order) {
              const { updateReferralTradeStats } = await import('@/lib/affiliate-tracking');
              await updateReferralTradeStats(order.userId, {
                volume: order.amount,
                revenue: netProfit // Platform profit from this hedge
              });
            }
          } catch (affiliateError) {
            // Don't fail hedge if affiliate tracking fails
            console.error('[HedgeManager] Affiliate tracking error (non-blocking):', affiliateError);
          }
        }

        return {
          success: true,
          hedgePositionId: hedgePosition.id,
        };
      } catch (hedgeError: any) {
        lastError = hedgeError;
        console.error(`[HedgeManager] Hedge attempt ${attempt}/${maxRetries} failed:`, hedgeError.message);

        // If circuit breaker is open, don't retry - fail fast
        if (hedgeError instanceof CircuitOpenError) {
          console.warn(`[HedgeManager] Circuit breaker open, skipping remaining retries`);
          break;
        }

        // Check for permanent errors that shouldn't be retried
        const errorMsg = hedgeError.message?.toLowerCase() || '';
        const isPermanent =
          errorMsg.includes('lower than the minimum') ||
          errorMsg.includes('insufficient funds') ||
          errorMsg.includes('unauthorized') ||
          errorMsg.includes('invalid api key');

        if (isPermanent) {
          console.error('[HedgeManager] Permanent error detected, aborting retries:', hedgeError.message);
          break;
        }

        // If not the last attempt, wait with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`[HedgeManager] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    await prisma.hedgePosition.update({
      where: { id: hedgePosition.id },
      data: {
        status: 'failed',
        failureReason: lastError?.message || 'Unknown error',
        retryCount: maxRetries,
      },
    });

    throw lastError || new Error('Hedge failed after all retries');
  }

  /**
   * Execute a split hedge (order laddering)
   */
  private async executeSplitHedge(params: {
    userOrderId: string;
    eventId: string;
    mapping: any;
    size: number;
    userPrice: number;
    hedgePrice: number;
    side: 'buy' | 'sell';
    spreadBps: number;
  }) {
    const { userOrderId, mapping, size, userPrice, hedgePrice, side, eventId } = params;

    console.log(`[HedgeManager] Large order detected (${size}), splitting into chunks...`);

    // Create split order plan
    const plan = orderSplitter.createSplitPlan(size, hedgePrice, side);

    console.log(`[HedgeManager] Split into ${plan.chunks.length} chunks, estimated slippage: ${plan.estimatedSlippage.toFixed(2)}bps`);

    // Create hedge position record
    const hedgePosition = await prisma.hedgePosition.create({
      data: {
        userOrderId: userOrderId === 'PENDING' ? null : userOrderId,
        polymarketMarketId: mapping.polymarketId,
        side: side === 'buy' ? 'BUY' : 'SELL',
        amount: size,
        userPrice,
        hedgePrice,
        spreadCaptured: Math.abs(userPrice - hedgePrice) * size,
        status: 'pending',
        metadata: {
          splitOrder: true,
          totalChunks: plan.chunks.length,
          chunks: plan.chunks.map(c => ({
            index: c.chunkIndex,
            size: c.size,
            targetPrice: c.targetPrice,
          })),
        },
      },
    });

    // Execute chunks incrementally
    const executedChunks: OrderChunk[] = [];
    let totalFees = 0;
    let lastError: string | undefined;

    for (const chunk of plan.chunks) {
      try {
        // Check circuit breaker before each chunk
        if (!polymarketCircuit.isAllowed()) {
          console.warn(`[HedgeManager] Circuit breaker OPEN, stopping chunk execution`);
          lastError = 'Circuit breaker open - Polymarket unavailable';
          break; // Stop processing remaining chunks
        }

        console.log(`[HedgeManager] Executing chunk ${chunk.chunkIndex + 1}/${plan.chunks.length}: ${chunk.size} shares at ~$${chunk.targetPrice.toFixed(4)}`);

        const polymarketOrder = await polymarketCircuit.execute(() =>
          polymarketTrading.placeMarketOrder(
            mapping.polymarketId,
            mapping.polymarketConditionId || '',
            mapping.resolvedTokenId || mapping.polymarketTokenId || '',
            side === 'buy' ? 'BUY' : 'SELL',
            chunk.size
          )
        );

        chunk.executed = true;
        chunk.executedPrice = chunk.targetPrice; // Would get actual fill price from API in production
        chunk.executedAt = new Date();
        chunk.polymarketOrderId = polymarketOrder.orderId;
        executedChunks.push(chunk);

        const chunkFees = estimatePolymarketFees(chunk.size, chunk.targetPrice);
        totalFees += chunkFees;

        console.log(`[HedgeManager] Chunk ${chunk.chunkIndex + 1} executed successfully`);

        // Wait before next chunk (unless this is the last one)
        if (chunk.chunkIndex < plan.chunks.length - 1) {
          const delay = orderSplitter.getOptimalDelay();
          console.log(`[HedgeManager] Waiting ${delay}ms before next chunk...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (chunkError: any) {
        console.error(`[HedgeManager] Chunk ${chunk.chunkIndex + 1} failed:`, chunkError.message);
        chunk.error = chunkError.message;
        lastError = chunkError.message;

        // Continue with remaining chunks (partial execution)
        // In production, might want to stop here depending on strategy
      }
    }

    // Calculate final statistics
    const stats = orderSplitter.calculateStats(plan);
    const finalStatus = executedChunks.length === plan.chunks.length ? 'hedged' :
      executedChunks.length > 0 ? 'partial' : 'failed';

    // Update hedge position
    await prisma.hedgePosition.update({
      where: { id: hedgePosition.id },
      data: {
        status: finalStatus,
        hedgedAt: executedChunks.length > 0 ? new Date() : null,
        polymarketFees: totalFees,
        netProfit: hedgePosition.spreadCaptured - totalFees,
        failureReason: lastError,
        metadata: {
          ...hedgePosition.metadata,
          executedChunks: executedChunks.length,
          totalChunks: plan.chunks.length,
          avgExecutionPrice: stats.avgPrice,
          totalSlippage: stats.totalSlippage,
          duration: stats.duration,
        },
      },
    });

    console.log(`[HedgeManager] Split hedge completed: ${executedChunks.length}/${plan.chunks.length} chunks executed`);
    console.log(`[HedgeManager] Avg price: $${stats.avgPrice.toFixed(4)}, Slippage: ${stats.totalSlippage.toFixed(2)}bps`);

    return {
      success: executedChunks.length > 0,
      hedgePositionId: hedgePosition.id,
      splitExecution: true,
      chunksExecuted: executedChunks.length,
      totalChunks: plan.chunks.length,
      avgExecutionPrice: stats.avgPrice,
      error: lastError,
    };
  }

  /**
   * Get current risk exposure
   */
  async getRiskExposure(): Promise<{
    totalUnhedged: number;
    totalHedged: number;
    openPositions: number;
    recentFailures: number;
  }> {
    try {
      // Get unhedged positions
      const unhedgedOrders = await prisma.order.findMany({
        where: {
          status: { in: ['open', 'partially_filled'] },
          hedgePosition: null,
        },
        select: {
          amount: true,
          price: true,
        },
      });

      const totalUnhedged = unhedgedOrders.reduce(
        (sum: number, order: any) => sum + order.amount * (order.price || 0),
        0
      );

      // Get hedged positions
      const hedgedPositions = await prisma.hedgePosition.findMany({
        where: {
          status: { in: ['hedged', 'partial'] },
        },
        select: {
          amount: true,
          hedgePrice: true,
        },
      });

      const totalHedged = hedgedPositions.reduce(
        (sum: number, pos: any) => sum + pos.amount * pos.hedgePrice,
        0
      );

      // Count open positions
      const openPositions = await prisma.hedgePosition.count({
        where: { status: { in: ['pending', 'hedged'] } },
      });

      // Count recent failures (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentFailures = await prisma.hedgePosition.count({
        where: {
          status: 'failed',
          createdAt: { gte: oneHourAgo },
        },
      });

      return {
        totalUnhedged,
        totalHedged,
        openPositions,
        recentFailures,
      };
    } catch (error) {
      console.error('[HedgeManager] Failed to get risk exposure:', error);
      return {
        totalUnhedged: 0,
        totalHedged: 0,
        openPositions: 0,
        recentFailures: 0,
      };
    }
  }

  /**
   * Take risk snapshot for monitoring
   */
  async takeRiskSnapshot(): Promise<void> {
    try {
      const exposure = await this.getRiskExposure();

      // Get hedge success rate
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentHedges = await prisma.hedgePosition.findMany({
        where: { createdAt: { gte: last24h } },
        select: { status: true, hedgedAt: true, createdAt: true },
      });

      const successfulHedges = recentHedges.filter((h: any) => h.status === 'hedged');
      const successRate = recentHedges.length > 0
        ? successfulHedges.length / recentHedges.length
        : 0;

      // Calculate average hedge time
      const hedgeTimes = successfulHedges
        .filter((h: any) => h.hedgedAt)
        .map((h: any) => h.hedgedAt!.getTime() - h.createdAt.getTime());

      const avgHedgeTime = hedgeTimes.length > 0
        ? hedgeTimes.reduce((a: number, b: number) => a + b, 0) / hedgeTimes.length
        : null;

      // Get total spread captured
      const totalSpread = await prisma.hedgePosition.aggregate({
        where: { status: 'hedged' },
        _sum: { netProfit: true },
      });

      await prisma.riskSnapshot.create({
        data: {
          totalUnhedgedValue: exposure.totalUnhedged,
          totalHedgedValue: exposure.totalHedged,
          netExposure: exposure.totalUnhedged - exposure.totalHedged,
          totalSpreadCaptured: totalSpread._sum.netProfit || 0,
          hedgeSuccessRate: successRate,
          averageHedgeTime: avgHedgeTime ? Math.round(avgHedgeTime) : null,
          openPositionsCount: exposure.openPositions,
          failedHedgesCount: exposure.recentFailures,
          marketExposure: {}, // TODO: Break down by market
        },
      });
    } catch (error) {
      console.error('[HedgeManager] Failed to take risk snapshot:', error);
    }
  }

  /**
   * Get all hedge positions for an event
   * Used when resolving an event to settle all related hedges
   */
  async getEventHedgePositions(eventId: string): Promise<any[]> {
    try {
      // Get the Polymarket market mapping for this event
      const mapping = await prisma.polymarketMarketMapping.findUnique({
        where: { internalEventId: eventId },
      });

      if (!mapping) {
        return [];
      }

      // Find all hedge positions for this market
      return await prisma.hedgePosition.findMany({
        where: {
          polymarketMarketId: mapping.polymarketId,
          status: { in: ['pending', 'hedged', 'partial'] },
        },
        include: {
          userOrder: true,
        },
      });
    } catch (error) {
      console.error('[HedgeManager] Failed to get event hedge positions:', error);
      return [];
    }
  }

  /**
   * Settle a hedge position after event resolution
   * Calculates final P/L and marks position as closed
   * 
   * This tracks the COMPLETE hedge P/L including:
   * 1. Polymarket position P/L (what we receive/owe to Polymarket)
   * 2. User liability P/L (what we owe/receive from user - handled separately in resolveMarket)
   * 3. Spread captured upfront
   * 4. Fees paid
   * 
   * For a perfect hedge, the Polymarket and user sides should net to ~$0, leaving just the spread.
   */
  async settleHedgePosition(
    hedgePositionId: string,
    winningOutcome: string,
    resolutionPrice: number = 1.0 // Winning outcome pays $1/share
  ): Promise<{ settled: boolean; pnl: number; error?: string }> {
    try {
      const hedgePosition = await prisma.hedgePosition.findUnique({
        where: { id: hedgePositionId },
        include: { userOrder: true },
      });

      if (!hedgePosition) {
        return { settled: false, pnl: 0, error: 'Hedge position not found' };
      }

      if (hedgePosition.status === 'closed') {
        return { settled: true, pnl: hedgePosition.netProfit || 0 };
      }

      // Determine which outcome we hedged and whether it won
      const userOrderOutcome = hedgePosition.userOrder?.outcomeId || hedgePosition.userOrder?.option;
      const outcomeWon = userOrderOutcome === winningOutcome;
      const hedgeSide = hedgePosition.side; // 'BUY' or 'SELL' on Polymarket

      /**
       * Settlement P/L Calculation for a proper hedge:
       * 
       * A hedge is designed so that the Polymarket position OFFSETS the user position.
       * The only profit/loss should come from:
       *   1. The spread captured upfront (always positive)
       *   2. Any slippage/difference between expected and actual prices
       *   3. Fees (always negative)
       * 
       * For a BUY hedge (user bought from us, we buy on Polymarket):
       *   - If outcome WINS: We owe user $1/share, Polymarket pays us $1/share → Net = 0
       *   - If outcome LOSES: User gets $0, our Polymarket shares worth $0 → Net = 0
       * 
       * For a SELL hedge (user sold to us, we sell on Polymarket):
       *   - If outcome WINS: We get $1/share from user position, pay $1/share to Polymarket → Net = 0
       *   - If outcome LOSES: Both positions worth $0 → Net = 0
       * 
       * In reality, we may have slight slippage from the hedge price vs user price.
       */

      // Calculate the settlement adjustment (should be ~$0 for a perfect hedge)
      // This captures any slippage or price difference at settlement
      let settlementAdjustment = 0;

      if (hedgeSide === 'BUY') {
        // We bought on Polymarket at hedgePrice, user bought from us at userPrice
        if (outcomeWon) {
          // Both positions pay out $1/share
          // Polymarket side: ($1 - hedgePrice) * amount = profit on Polymarket
          // User side: (userPrice - $1) * amount = loss on user payout (we owe difference)
          // Net adjustment = (1 - hedgePrice - 1 + userPrice) * amount = (userPrice - hedgePrice) * amount
          // This equals the spread - so no adjustment needed (spread already captured)
          settlementAdjustment = 0;
        } else {
          // Both positions worth $0
          // Polymarket loss: -hedgePrice * amount (we paid for worthless shares)
          // User gain: +userPrice * amount (we don't have to pay out)
          // Net adjustment = (userPrice - hedgePrice) * amount = spread (already captured)
          settlementAdjustment = 0;
        }
      } else {
        // SELL - we sold on Polymarket at hedgePrice, user sold to us at userPrice
        if (outcomeWon) {
          // Both positions pay out $1/share
          // Polymarket loss: -(1 - hedgePrice) * amount (we must pay difference)  
          // User gain: (1 - userPrice) * amount (we receive value from shares we hold)
          // Net adjustment = (hedgePrice - userPrice) * amount = -spread (but spread already captured)
          settlementAdjustment = 0;
        } else {
          // Both positions worth $0
          // Polymarket gain: hedgePrice * amount (we keep the premium)
          // User loss: -userPrice * amount (shares we hold are worthless)
          // Net adjustment = (hedgePrice - userPrice) * amount = spread (already captured)
          settlementAdjustment = 0;
        }
      }

      // Subtract fees from spread to get total P/L
      // Note: Convert Decimal types to numbers for arithmetic
      const spreadCaptured = Number(hedgePosition.spreadCaptured) || 0;
      const polymarketFees = Number(hedgePosition.polymarketFees) || 0;
      const gasCost = Number(hedgePosition.gasCost) || 0;
      const totalFees = polymarketFees + gasCost;

      // Total P/L = Spread captured upfront + Settlement adjustment (≈0) - Fees
      const totalPnl = spreadCaptured + settlementAdjustment - totalFees;

      // Update the position
      await prisma.hedgePosition.update({
        where: { id: hedgePositionId },
        data: {
          status: 'closed',
          closedAt: new Date(),
          netProfit: totalPnl,
          metadata: {
            ...(hedgePosition.metadata as object || {}),
            settlementDetails: {
              winningOutcome,
              outcomeWon,
              settlementAdjustment,
              spreadCaptured,
              totalFees,
              totalPnl,
              resolutionPrice,
              settledAt: new Date().toISOString(),
              explanation: `Hedge settled. Spread: $${spreadCaptured.toFixed(2)}, Fees: $${totalFees.toFixed(2)}, Net P/L: $${totalPnl.toFixed(2)}`,
            },
          },
        },
      });

      console.log(`[HedgeManager] Settled hedge ${hedgePositionId}: Total PnL = $${totalPnl.toFixed(2)} (Spread: $${spreadCaptured.toFixed(2)}, Adjustment: $${settlementAdjustment.toFixed(2)}, Fees: -$${totalFees.toFixed(2)})`);

      return { settled: true, pnl: totalPnl };
    } catch (error: any) {
      console.error('[HedgeManager] Failed to settle hedge position:', error);
      return { settled: false, pnl: 0, error: error.message };
    }
  }

  /**
   * Validate that a market mapping has all required fields for hedging
   * Returns validation result with detailed error if invalid
   */
  validateMapping(mapping: any): { valid: boolean; error?: string } {
    if (!mapping) {
      return { valid: false, error: 'Mapping not found' };
    }

    if (!mapping.isActive) {
      return { valid: false, error: 'Mapping is not active' };
    }

    if (!mapping.polymarketId) {
      return { valid: false, error: 'Missing polymarketId' };
    }

    // For binary events, we need yesTokenId or noTokenId
    // For multiple events, we need outcomeMapping with token IDs
    const hasTokenIds = mapping.yesTokenId || mapping.noTokenId;
    const hasOutcomeMapping = mapping.outcomeMapping?.outcomes?.some(
      (o: any) => o.polymarketId
    );

    if (!hasTokenIds && !hasOutcomeMapping && !mapping.polymarketTokenId) {
      return {
        valid: false,
        error: 'Missing token IDs for Polymarket trading. Please re-approve the event mapping.'
      };
    }

    return { valid: true };
  }

  /**
   * Settle all open hedge positions for an event
   * Called during market resolution
   */
  async settleEventHedges(
    eventId: string,
    winningOutcome: string
  ): Promise<{ settledCount: number; totalPnl: number; errors: string[] }> {
    const positions = await this.getEventHedgePositions(eventId);

    let settledCount = 0;
    let totalPnl = 0;
    const errors: string[] = [];

    for (const position of positions) {
      const result = await this.settleHedgePosition(position.id, winningOutcome);
      if (result.settled) {
        settledCount++;
        totalPnl += result.pnl;
      } else if (result.error) {
        errors.push(`Position ${position.id}: ${result.error}`);
      }
    }

    console.log(`[HedgeManager] Settled ${settledCount}/${positions.length} hedges for event ${eventId}, total PnL: $${totalPnl.toFixed(2)}`);

    return { settledCount, totalPnl, errors };
  }
}

// Export singleton
export const hedgeManager = new HedgeManager();

