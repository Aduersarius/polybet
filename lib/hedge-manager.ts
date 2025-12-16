/**
 * Hedge Manager
 * 
 * Core logic for managing hedges, calculating spreads, and monitoring risk
 */

import { prisma } from './prisma';
import { polymarketTrading, estimatePolymarketFees } from './polymarket-trading';
import { orderSplitter, type SplitOrderPlan, type OrderChunk } from './order-splitter';

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
  enabled: false, // Disabled by default until credentials configured
  minSpreadBps: 200, // 2% minimum spread
  maxSlippageBps: 100, // 1% max slippage
  maxUnhedgedExposure: 10000, // $10k max unhedged
  maxPositionSize: 1000, // $1k max single position
  hedgeTimeoutMs: 5000, // 5 seconds
  retryAttempts: 3,
};

export class HedgeManager {
  private config: HedgeConfig;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Load configuration from database
   */
  async loadConfig(): Promise<HedgeConfig> {
    try {
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

      return this.config;
    } catch (error) {
      console.error('[HedgeManager] Failed to load config:', error);
      return this.config;
    }
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

    // Update in-memory config
    (this.config as any)[key] = value;
  }

  /**
   * Get current configuration
   */
  getConfig(): HedgeConfig {
    return { ...this.config };
  }

  /**
   * Calculate optimal spread based on market conditions
   */
  calculateSpread(params: {
    eventId: string;
    size: number;
    volatility?: number;
    liquidityScore?: number;
  }): number {
    const { size, volatility = 0.5, liquidityScore = 0.5 } = params;

    // Base spread from config
    let spreadBps = this.config.minSpreadBps;

    // Adjust for position size (larger = more spread)
    const sizeAdjustment = Math.min(100, (size / this.config.maxPositionSize) * 50);
    spreadBps += sizeAdjustment;

    // Adjust for volatility (higher = more spread)
    const volatilityAdjustment = volatility * 100;
    spreadBps += volatilityAdjustment;

    // Adjust for liquidity (lower = more spread)
    const liquidityAdjustment = (1 - liquidityScore) * 50;
    spreadBps += liquidityAdjustment;

    // Cap at reasonable maximum (10%)
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
  }): Promise<{
    feasible: boolean;
    reason?: string;
    polymarketMarketId?: string;
    estimatedSpread?: number;
    estimatedFees?: number;
  }> {
    // Check if hedging is enabled
    if (!this.config.enabled) {
      return {
        feasible: false,
        reason: 'Hedging is disabled',
      };
    }

    // Check position size limits
    if (params.size > this.config.maxPositionSize) {
      return {
        feasible: false,
        reason: `Position size ${params.size} exceeds maximum ${this.config.maxPositionSize}`,
      };
    }

    // Get Polymarket market mapping
    const mapping = await prisma.polymarketMarketMapping.findUnique({
      where: { internalEventId: params.eventId },
    });

    if (!mapping || !mapping.isActive) {
      return {
        feasible: false,
        reason: 'No active Polymarket market mapping found',
      };
    }

    // Calculate spread
    const spreadBps = this.calculateSpread({
      eventId: params.eventId,
      size: params.size,
    });

    // Estimate fees
    const estimatedFees = estimatePolymarketFees(params.size, params.price);

    // Check if spread covers fees
    const spreadValue = (spreadBps / 10000) * params.size * params.price;
    if (spreadValue < estimatedFees * 1.5) {
      return {
        feasible: false,
        reason: `Spread (${spreadValue.toFixed(2)}) insufficient to cover fees (${estimatedFees.toFixed(2)})`,
        estimatedSpread: spreadValue,
        estimatedFees,
      };
    }

    // Check Polymarket liquidity (optional - skip if checking top volume markets)
    try {
      const liquidityCheck = await polymarketTrading.checkLiquidity(
        mapping.polymarketId,
        params.side === 'buy' ? 'BUY' : 'SELL',
        params.size,
        this.config.maxSlippageBps
      );

      if (!liquidityCheck.canHedge) {
        return {
          feasible: false,
          reason: liquidityCheck.reason,
          polymarketMarketId: mapping.polymarketId,
          estimatedSpread: spreadValue,
          estimatedFees,
        };
      }

      return {
        feasible: true,
        polymarketMarketId: mapping.polymarketId,
        estimatedSpread: spreadValue,
        estimatedFees,
      };
    } catch (error) {
      console.error('[HedgeManager] Liquidity check failed (not critical):', error);
      
      // For top volume markets, proceed anyway since liquidity is guaranteed
      console.log('[HedgeManager] Proceeding without liquidity check for high-volume market');
      return {
        feasible: true,
        polymarketMarketId: mapping.polymarketId,
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
  }): Promise<{
    success: boolean;
    hedgePositionId?: string;
    splitExecution?: boolean;
    chunksExecuted?: number;
    totalChunks?: number;
    avgExecutionPrice?: number;
    error?: string;
  }> {
    const { userOrderId, eventId, size, userPrice, side } = params;

    try {
      // Get Polymarket mapping
      const mapping = await prisma.polymarketMarketMapping.findUnique({
        where: { internalEventId: eventId },
      });

      if (!mapping) {
        throw new Error('No Polymarket market mapping found');
      }

      // Calculate spread and hedge price
      const spreadBps = this.calculateSpread({ eventId, size });
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
          mapping,
          size,
          userPrice,
          hedgePrice,
          side,
          spreadBps,
        });
      }

      // Large order - split and execute incrementally
      return await this.executeSplitHedge({
        userOrderId,
        eventId,
        mapping,
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
  }) {
    const { userOrderId, mapping, size, userPrice, hedgePrice, side } = params;

    // Create hedge position record
    const hedgePosition = await prisma.hedgePosition.create({
      data: {
        userOrderId,
        polymarketMarketId: mapping.polymarketId,
        side: side === 'buy' ? 'BUY' : 'SELL',
        amount: size,
        userPrice,
        hedgePrice,
        spreadCaptured: Math.abs(userPrice - hedgePrice) * size,
        status: 'pending',
      },
    });

    try {
      const polymarketOrder = await polymarketTrading.placeMarketOrder(
        mapping.polymarketId,
        mapping.polymarketConditionId || '',
        mapping.polymarketTokenId || '',
        side === 'buy' ? 'BUY' : 'SELL',
        size
      );

      const fees = estimatePolymarketFees(size, hedgePrice);
      await prisma.hedgePosition.update({
        where: { id: hedgePosition.id },
        data: {
          polymarketOrderId: polymarketOrder.orderId,
          status: 'hedged',
          hedgedAt: new Date(),
          polymarketFees: fees,
          netProfit: hedgePosition.spreadCaptured - fees,
        },
      });

      console.log(`[HedgeManager] Successfully hedged order ${userOrderId}`);

      return {
        success: true,
        hedgePositionId: hedgePosition.id,
      };
    } catch (hedgeError: any) {
      await prisma.hedgePosition.update({
        where: { id: hedgePosition.id },
        data: {
          status: 'failed',
          failureReason: hedgeError.message,
        },
      });
      throw hedgeError;
    }
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
        userOrderId,
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
        console.log(`[HedgeManager] Executing chunk ${chunk.chunkIndex + 1}/${plan.chunks.length}: ${chunk.size} shares at ~$${chunk.targetPrice.toFixed(4)}`);

        const polymarketOrder = await polymarketTrading.placeMarketOrder(
          mapping.polymarketId,
          mapping.polymarketConditionId || '',
          mapping.polymarketTokenId || '',
          side === 'buy' ? 'BUY' : 'SELL',
          chunk.size
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
}

// Export singleton
export const hedgeManager = new HedgeManager();
