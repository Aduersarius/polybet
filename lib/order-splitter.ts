/**
 * Order Splitter - Slippage Laddering Implementation
 * 
 * Splits large orders into smaller chunks to minimize price impact and slippage
 * Also known as: TWAP (Time-Weighted Average Price), Iceberg Orders
 */

export interface SplitConfig {
  maxChunkSize: number; // Max size per chunk (e.g., $100)
  minChunkSize: number; // Min size per chunk (e.g., $10)
  delayBetweenChunks: number; // Delay in ms between chunks (e.g., 1000ms = 1s)
  maxSlippagePerChunk: number; // Max acceptable slippage per chunk (bps)
  adaptiveSizing: boolean; // Adjust chunk size based on market conditions
}

export interface OrderChunk {
  chunkIndex: number;
  size: number;
  targetPrice: number;
  executed: boolean;
  executedPrice?: number;
  executedAt?: Date;
  polymarketOrderId?: string;
  error?: string;
}

export interface SplitOrderPlan {
  totalSize: number;
  chunks: OrderChunk[];
  estimatedDuration: number; // Total time in ms
  estimatedSlippage: number; // Expected total slippage
}

export class OrderSplitter {
  private defaultConfig: SplitConfig = {
    maxChunkSize: 100, // $100 per chunk
    minChunkSize: 10, // $10 min
    delayBetweenChunks: 2000, // 2 seconds
    maxSlippagePerChunk: 50, // 0.5%
    adaptiveSizing: true,
  };

  constructor(private config: Partial<SplitConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Determine if an order should be split
   */
  shouldSplit(orderSize: number): boolean {
    return orderSize > (this.config.maxChunkSize || this.defaultConfig.maxChunkSize);
  }

  /**
   * Create a split order plan
   */
  createSplitPlan(
    totalSize: number,
    basePrice: number,
    side: 'buy' | 'sell'
  ): SplitOrderPlan {
    const maxChunk = this.config.maxChunkSize || this.defaultConfig.maxChunkSize;
    const minChunk = this.config.minChunkSize || this.defaultConfig.minChunkSize;
    const delay = this.config.delayBetweenChunks || this.defaultConfig.delayBetweenChunks;

    // Calculate number of chunks
    const numChunks = Math.ceil(totalSize / maxChunk);
    
    // Calculate chunk sizes (distribute evenly)
    const chunks: OrderChunk[] = [];
    let remainingSize = totalSize;

    for (let i = 0; i < numChunks; i++) {
      // Calculate size for this chunk
      let chunkSize = Math.min(maxChunk, remainingSize);
      
      // Ensure last chunk isn't too small
      if (i === numChunks - 2 && remainingSize - chunkSize < minChunk) {
        // Merge last two chunks
        chunkSize = remainingSize;
      }

      // Calculate target price with expected slippage
      // Assume price moves linearly with cumulative volume
      const cumulativeVolume = totalSize * (i + 0.5) / numChunks;
      const priceImpact = this.estimatePriceImpact(cumulativeVolume, totalSize, side);
      const targetPrice = this.applyPriceImpact(basePrice, priceImpact, side);

      chunks.push({
        chunkIndex: i,
        size: chunkSize,
        targetPrice,
        executed: false,
      });

      remainingSize -= chunkSize;

      if (remainingSize <= 0) break;
    }

    // Calculate total estimated slippage
    const avgExecutionPrice = chunks.reduce((sum, c) => sum + c.targetPrice * c.size, 0) / totalSize;
    const estimatedSlippage = Math.abs((avgExecutionPrice - basePrice) / basePrice) * 10000; // in bps

    return {
      totalSize,
      chunks,
      estimatedDuration: (chunks.length - 1) * delay,
      estimatedSlippage,
    };
  }

  /**
   * Estimate price impact based on order size
   * Uses square-root market impact model
   */
  private estimatePriceImpact(
    orderSize: number,
    totalLiquidity: number,
    side: 'buy' | 'sell'
  ): number {
    // Square-root market impact model
    // Impact = k * sqrt(orderSize / liquidity)
    // where k is market impact coefficient (typically 0.1-0.5)
    const k = 0.2; // Conservative estimate
    
    // Assume total liquidity is 10x the order size (conservative)
    const estimatedLiquidity = totalLiquidity * 10;
    
    const impact = k * Math.sqrt(orderSize / estimatedLiquidity);
    
    // Cap impact at 5%
    return Math.min(impact, 0.05);
  }

  /**
   * Apply price impact to base price
   */
  private applyPriceImpact(
    basePrice: number,
    impact: number,
    side: 'buy' | 'sell'
  ): number {
    // Buy orders push price up, sell orders push price down
    const direction = side === 'buy' ? 1 : -1;
    const newPrice = basePrice * (1 + direction * impact);
    
    // Ensure price stays within valid range (0.01 to 0.99)
    return Math.max(0.01, Math.min(0.99, newPrice));
  }

  /**
   * Calculate adaptive chunk size based on market conditions
   */
  calculateAdaptiveChunkSize(
    remainingSize: number,
    currentSlippage: number,
    targetSlippage: number
  ): number {
    const maxChunk = this.config.maxChunkSize || this.defaultConfig.maxChunkSize;
    const minChunk = this.config.minChunkSize || this.defaultConfig.minChunkSize;

    if (!this.config.adaptiveSizing) {
      return Math.min(maxChunk, remainingSize);
    }

    // If slippage is high, reduce chunk size
    // If slippage is low, can increase chunk size
    const slippageRatio = currentSlippage / targetSlippage;
    
    let adaptiveSize: number;
    if (slippageRatio > 1.5) {
      // High slippage - reduce chunk size by 50%
      adaptiveSize = maxChunk * 0.5;
    } else if (slippageRatio > 1.0) {
      // Moderate slippage - reduce chunk size by 25%
      adaptiveSize = maxChunk * 0.75;
    } else if (slippageRatio < 0.5) {
      // Low slippage - can use full chunk size
      adaptiveSize = maxChunk;
    } else {
      // Normal slippage - slightly reduce
      adaptiveSize = maxChunk * 0.9;
    }

    // Ensure within bounds
    return Math.max(minChunk, Math.min(maxChunk, Math.min(adaptiveSize, remainingSize)));
  }

  /**
   * Get optimal delay between chunks based on market volatility
   */
  getOptimalDelay(volatility: number = 0.5): number {
    const baseDelay = this.config.delayBetweenChunks || this.defaultConfig.delayBetweenChunks;
    
    // Higher volatility = longer delay to let market stabilize
    // Volatility range: 0 (calm) to 1 (very volatile)
    const volatilityMultiplier = 1 + volatility;
    
    return Math.round(baseDelay * volatilityMultiplier);
  }

  /**
   * Adjust plan based on execution results
   */
  adjustPlan(
    plan: SplitOrderPlan,
    executedChunks: OrderChunk[],
    currentMarketPrice: number
  ): SplitOrderPlan {
    // Calculate actual slippage so far
    const executedSize = executedChunks.reduce((sum, c) => sum + c.size, 0);
    const executedValue = executedChunks.reduce(
      (sum, c) => sum + (c.executedPrice || c.targetPrice) * c.size,
      0
    );
    const avgExecutedPrice = executedValue / executedSize;
    const actualSlippage = Math.abs((avgExecutedPrice - plan.chunks[0].targetPrice) / plan.chunks[0].targetPrice);

    // Find remaining chunks
    const remainingChunks = plan.chunks.filter(c => !c.executed);
    
    if (remainingChunks.length === 0) {
      return plan; // All done
    }

    // Adjust remaining chunk sizes if slippage is higher than expected
    if (actualSlippage > plan.estimatedSlippage * 1.5) {
      // Reduce chunk sizes
      const scaleFactor = 0.7;
      remainingChunks.forEach(chunk => {
        chunk.size *= scaleFactor;
      });
    }

    // Update target prices based on current market price
    remainingChunks.forEach(chunk => {
      chunk.targetPrice = currentMarketPrice;
    });

    return plan;
  }

  /**
   * Calculate statistics for completed split order
   */
  calculateStats(plan: SplitOrderPlan): {
    totalExecuted: number;
    avgPrice: number;
    totalSlippage: number;
    successRate: number;
    duration: number;
  } {
    const executedChunks = plan.chunks.filter(c => c.executed);
    
    if (executedChunks.length === 0) {
      return {
        totalExecuted: 0,
        avgPrice: 0,
        totalSlippage: 0,
        successRate: 0,
        duration: 0,
      };
    }

    const totalExecuted = executedChunks.reduce((sum, c) => sum + c.size, 0);
    const totalValue = executedChunks.reduce(
      (sum, c) => sum + (c.executedPrice || c.targetPrice) * c.size,
      0
    );
    const avgPrice = totalValue / totalExecuted;
    
    const basePrice = plan.chunks[0].targetPrice;
    const totalSlippage = Math.abs((avgPrice - basePrice) / basePrice) * 10000; // bps

    const firstExecution = executedChunks[0].executedAt;
    const lastExecution = executedChunks[executedChunks.length - 1].executedAt;
    const duration = firstExecution && lastExecution
      ? lastExecution.getTime() - firstExecution.getTime()
      : 0;

    return {
      totalExecuted,
      avgPrice,
      totalSlippage,
      successRate: executedChunks.length / plan.chunks.length,
      duration,
    };
  }
}

// Export singleton with default config
export const orderSplitter = new OrderSplitter();

// Helper function to load config from database
export async function loadOrderSplitterConfig(): Promise<OrderSplitter> {
  try {
    const { prisma } = await import('./prisma');
    
    const configs = await prisma.hedgeConfig.findMany({
      where: {
        key: {
          in: [
            'maxChunkSize',
            'minChunkSize',
            'delayBetweenChunks',
            'maxSlippagePerChunk',
            'adaptiveSizing',
          ],
        },
      },
    });

    const config: Partial<SplitConfig> = {};
    for (const cfg of configs) {
      (config as any)[cfg.key] = cfg.value;
    }

    return new OrderSplitter(config);
  } catch (error) {
    console.error('[OrderSplitter] Failed to load config:', error);
    return new OrderSplitter();
  }
}

