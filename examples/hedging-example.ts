/**
 * Hedging System Usage Examples
 * 
 * This file demonstrates how to use the hedging system programmatically
 */

import { hedgeManager } from '../lib/hedge-manager';
import { polymarketTrading } from '../lib/polymarket-trading';
import { prisma } from '../lib/prisma';

// ============================================
// Example 1: Check if Hedging is Enabled
// ============================================
async function checkHedgingStatus() {
  await hedgeManager.loadConfig();
  const config = hedgeManager.getConfig();
  
  console.log('Hedging Status:', {
    enabled: config.enabled,
    minSpread: `${config.minSpreadBps / 100}%`,
    maxSlippage: `${config.maxSlippageBps / 100}%`,
    maxExposure: `$${config.maxUnhedgedExposure}`,
    polymarketConnected: polymarketTrading.isEnabled(),
  });
}

// ============================================
// Example 2: Check if Order Can Be Hedged
// ============================================
async function checkIfOrderCanBeHedged(
  eventId: string,
  size: number,
  price: number,
  side: 'buy' | 'sell'
) {
  await hedgeManager.loadConfig();
  
  const result = await hedgeManager.canHedge({
    eventId,
    size,
    price,
    side,
  });
  
  console.log('Hedge Feasibility Check:', {
    feasible: result.feasible,
    reason: result.reason,
    estimatedSpread: result.estimatedSpread,
    estimatedFees: result.estimatedFees,
    netProfit: result.estimatedSpread! - result.estimatedFees!,
  });
  
  return result.feasible;
}

// ============================================
// Example 3: Manually Execute a Hedge
// ============================================
async function manuallyHedgeOrder(orderId: string) {
  // Get order details
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true },
  });
  
  if (!order) {
    console.error('Order not found');
    return;
  }
  
  // Execute hedge
  const result = await hedgeManager.executeHedge({
    userOrderId: order.id,
    eventId: order.eventId,
    size: order.amount,
    userPrice: order.price,
    side: order.side as 'buy' | 'sell',
  });
  
  if (result.success) {
    console.log('✅ Hedge successful!', {
      hedgePositionId: result.hedgePositionId,
    });
  } else {
    console.error('❌ Hedge failed:', result.error);
  }
}

// ============================================
// Example 4: Get Current Risk Exposure
// ============================================
async function getRiskExposure() {
  const exposure = await hedgeManager.getRiskExposure();
  
  console.log('Current Risk Exposure:', {
    totalUnhedged: `$${exposure.totalUnhedged.toFixed(2)}`,
    totalHedged: `$${exposure.totalHedged.toFixed(2)}`,
    netExposure: `$${(exposure.totalUnhedged - exposure.totalHedged).toFixed(2)}`,
    openPositions: exposure.openPositions,
    recentFailures: exposure.recentFailures,
  });
  
  // Alert if exposure is high
  const config = hedgeManager.getConfig();
  const exposurePercent = (exposure.totalUnhedged / config.maxUnhedgedExposure) * 100;
  
  if (exposurePercent > 80) {
    console.warn(`⚠️  Unhedged exposure is at ${exposurePercent.toFixed(1)}% of limit!`);
  }
}

// ============================================
// Example 5: Check Polymarket Liquidity
// ============================================
async function checkPolymarketLiquidity(
  marketId: string,
  side: 'BUY' | 'SELL',
  size: number
) {
  const orderbook = await polymarketTrading.getOrderbook(marketId);
  
  console.log('Orderbook:', {
    marketId,
    bids: orderbook.bids.slice(0, 5),
    asks: orderbook.asks.slice(0, 5),
    timestamp: new Date(orderbook.timestamp).toISOString(),
  });
  
  const liquidityCheck = await polymarketTrading.checkLiquidity(
    marketId,
    side,
    size,
    100 // 1% max slippage
  );
  
  console.log('Liquidity Check:', {
    canTrade: liquidityCheck.canHedge,
    availableSize: liquidityCheck.availableSize,
    bestPrice: liquidityCheck.bestPrice,
    slippage: `${liquidityCheck.estimatedSlippage.toFixed(2)}bps`,
    reason: liquidityCheck.reason,
  });
}

// ============================================
// Example 6: Calculate Optimal Spread
// ============================================
async function calculateSpreadForOrder(
  eventId: string,
  size: number,
  volatility?: number
) {
  await hedgeManager.loadConfig();
  
  const spreadBps = hedgeManager.calculateSpread({
    eventId,
    size,
    volatility: volatility || 0.5,
    liquidityScore: 0.7,
  });
  
  const spreadPercent = spreadBps / 100;
  
  console.log('Spread Calculation:', {
    eventId,
    size,
    volatility: volatility || 0.5,
    spread: `${spreadPercent}%`,
    spreadBps,
  });
  
  // Example prices
  const userBuyPrice = 0.52;
  const hedgeBuyPrice = userBuyPrice * (1 - spreadBps / 10000);
  
  console.log('Example Prices:', {
    userPays: `$${userBuyPrice.toFixed(4)}`,
    wePayPolymarket: `$${hedgeBuyPrice.toFixed(4)}`,
    spreadPerShare: `$${(userBuyPrice - hedgeBuyPrice).toFixed(4)}`,
    profitFor100Shares: `$${((userBuyPrice - hedgeBuyPrice) * 100).toFixed(2)}`,
  });
}

// ============================================
// Example 7: Update Configuration
// ============================================
async function updateConfiguration(
  key: string,
  value: any,
  updatedBy: string = 'admin'
) {
  await hedgeManager.updateConfig(key as any, value, updatedBy);
  
  console.log(`✅ Updated ${key} to ${value}`);
  
  // Reload and show new config
  await hedgeManager.loadConfig();
  const config = hedgeManager.getConfig();
  console.log('New configuration:', config);
}

// ============================================
// Example 8: Monitor Recent Hedges
// ============================================
async function monitorRecentHedges(hours: number = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const hedges = await prisma.hedgePosition.findMany({
    where: {
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  console.log(`Recent Hedges (last ${hours} hours):`);
  console.log('─'.repeat(80));
  
  for (const hedge of hedges) {
    const profit = hedge.netProfit;
    const status = hedge.status === 'hedged' ? '✅' : hedge.status === 'failed' ? '❌' : '⏳';
    
    console.log(`${status} ${hedge.id.slice(0, 8)} | ${hedge.status.padEnd(10)} | ` +
      `$${hedge.amount.toFixed(2).padStart(8)} @ $${hedge.userPrice.toFixed(4)} | ` +
      `Profit: $${profit.toFixed(2).padStart(6)} | ` +
      `${new Date(hedge.createdAt).toLocaleTimeString()}`
    );
  }
  
  // Summary
  const successful = hedges.filter((h: any) => h.status === 'hedged');
  const totalProfit = successful.reduce((sum: number, h: any) => sum + h.netProfit, 0);
  const avgProfit = successful.length > 0 ? totalProfit / successful.length : 0;
  
  console.log('─'.repeat(80));
  console.log(`Total: ${hedges.length} | ` +
    `Success: ${successful.length} (${((successful.length / hedges.length) * 100).toFixed(1)}%) | ` +
    `Profit: $${totalProfit.toFixed(2)} | ` +
    `Avg: $${avgProfit.toFixed(2)}`
  );
}

// ============================================
// Example 9: Create Polymarket Market Mapping
// ============================================
async function createMarketMapping(
  internalEventId: string,
  polymarketId: string,
  polymarketConditionId: string,
  polymarketTokenId: string
) {
  const mapping = await prisma.polymarketMarketMapping.create({
    data: {
      internalEventId,
      polymarketId,
      polymarketConditionId,
      polymarketTokenId,
      isActive: true,
    },
  });
  
  console.log('✅ Market mapping created:', {
    id: mapping.id,
    internalEventId: mapping.internalEventId,
    polymarketId: mapping.polymarketId,
  });
}

// ============================================
// Example 10: Take Risk Snapshot
// ============================================
async function takeRiskSnapshot() {
  await hedgeManager.takeRiskSnapshot();
  
  const latest = await prisma.riskSnapshot.findFirst({
    orderBy: { timestamp: 'desc' },
  });
  
  console.log('📊 Latest Risk Snapshot:', {
    timestamp: latest?.timestamp,
    unhedged: `$${latest?.totalUnhedgedValue.toFixed(2)}`,
    hedged: `$${latest?.totalHedgedValue.toFixed(2)}`,
    netExposure: `$${latest?.netExposure.toFixed(2)}`,
    successRate: `${(latest?.hedgeSuccessRate || 0) * 100}%`,
    openPositions: latest?.openPositionsCount,
  });
}

// ============================================
// Run Examples
// ============================================
async function runExamples() {
  console.log('🚀 Hedging System Examples\n');
  
  try {
    console.log('\n1️⃣  Checking Hedging Status...');
    await checkHedgingStatus();
    
    console.log('\n2️⃣  Getting Risk Exposure...');
    await getRiskExposure();
    
    console.log('\n3️⃣  Monitoring Recent Hedges...');
    await monitorRecentHedges(24);
    
    console.log('\n4️⃣  Calculating Spread...');
    await calculateSpreadForOrder('example-event-id', 100, 0.6);
    
    console.log('\n5️⃣  Taking Risk Snapshot...');
    await takeRiskSnapshot();
    
    console.log('\n✅ Examples completed!\n');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export functions for use in other files
export {
  checkHedgingStatus,
  checkIfOrderCanBeHedged,
  manuallyHedgeOrder,
  getRiskExposure,
  checkPolymarketLiquidity,
  calculateSpreadForOrder,
  updateConfiguration,
  monitorRecentHedges,
  createMarketMapping,
  takeRiskSnapshot,
};

// Run if executed directly
if (require.main === module) {
  runExamples()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
