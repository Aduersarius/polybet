/**
 * Test Hedging Setup API Endpoint
 * 
 * Access via: http://localhost:3000/api/test-hedge
 */

import { NextResponse } from 'next/server';
import { polymarketTrading } from '@/lib/polymarket-trading';
import { hedgeManager } from '@/lib/hedge-manager';

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      passed: 0,
      failed: 0,
      total: 0,
    },
  };

  function addTest(name: string, passed: boolean, message: string, details?: any) {
    results.tests.push({ name, passed, message, details });
    results.summary.total++;
    if (passed) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
  }

  // Test 1: Check Environment Variables
  const requiredVars = [
    'POLYMARKET_CLOB_API_URL',
    'POLYMARKET_API_KEY',
    'POLYMARKET_API_SECRET',
    'POLYMARKET_PASSPHRASE',
    'POLYMARKET_PRIVATE_KEY',
    'POLYMARKET_CHAIN_ID',
  ];

  const envStatus: any = {};
  let allEnvSet = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    const isSet = value &&
      value !== '' &&
      !value.includes('your_') &&
      !value.includes('YOUR_');

    envStatus[varName] = isSet ? '✓ Set' : '✗ Not Set';
    if (!isSet) allEnvSet = false;
  }

  addTest(
    'Environment Variables',
    allEnvSet,
    allEnvSet ? 'All environment variables are set' : 'Some environment variables are missing',
    envStatus
  );

  if (!allEnvSet) {
    results.summary.status = 'FAILED';
    results.summary.message = 'Please set all environment variables in .env file';
    return NextResponse.json(results, { status: 500 });
  }

  // Test 2: Initialize Trading Service
  try {
    const isEnabled = polymarketTrading.isEnabled();
    addTest(
      'Trading Service Initialization',
      isEnabled,
      isEnabled ? 'Trading service initialized successfully' : 'Trading service not enabled',
      { enabled: isEnabled }
    );

    if (!isEnabled) {
      results.summary.status = 'FAILED';
      results.summary.message = 'Trading service initialization failed';
      return NextResponse.json(results, { status: 500 });
    }
  } catch (error: any) {
    addTest(
      'Trading Service Initialization',
      false,
      `Failed to initialize: ${error.message}`,
      { error: error.message }
    );
    results.summary.status = 'FAILED';
    return NextResponse.json(results, { status: 500 });
  }

  // Test 3: Fetch Orderbook (optional - for liquidity checking)
  try {
    const testMarketId = '21742'; // Popular Polymarket market
    const orderbook = await polymarketTrading.getOrderbook(testMarketId);

    const success = orderbook && orderbook.bids && orderbook.asks;
    addTest(
      'API Connection (Orderbook Fetch)',
      !!success,
      success
        ? `Successfully fetched orderbook with ${orderbook.bids.length} bids and ${orderbook.asks.length} asks`
        : 'Failed to fetch orderbook',
      success ? {
        bids: orderbook.bids.length,
        asks: orderbook.asks.length,
        bestBid: orderbook.bids[0] ? `$${orderbook.bids[0].price.toFixed(4)}` : 'none',
        bestAsk: orderbook.asks[0] ? `$${orderbook.asks[0].price.toFixed(4)}` : 'none',
      } : null
    );
  } catch (error: any) {
    // Mark as warning rather than failure since orderbook is optional
    addTest(
      'API Connection (Orderbook Fetch)',
      false,
      `⚠️ Orderbook fetch failed (not critical): ${error.message}`,
      {
        error: error.message,
        note: 'This is used for pre-trade liquidity checks. Hedging can still work without it.',
        possibleCauses: [
          'Different API endpoint structure',
          'Requires additional authentication',
          'Feature not available in your API tier'
        ]
      }
    );
  }

  // Test 4: Check Liquidity
  try {
    const testMarketId = '21742';
    const testSize = 10;

    const liquidityCheck = await polymarketTrading.checkLiquidity(
      testMarketId,
      'BUY',
      testSize,
      100
    );

    addTest(
      'Liquidity Check',
      !!liquidityCheck,
      liquidityCheck
        ? `Can hedge: ${liquidityCheck.canHedge}, Available: ${liquidityCheck.availableSize.toFixed(2)} shares`
        : 'Liquidity check failed',
      liquidityCheck ? {
        canHedge: liquidityCheck.canHedge,
        availableSize: liquidityCheck.availableSize,
        bestPrice: liquidityCheck.bestPrice,
        slippage: `${liquidityCheck.estimatedSlippage.toFixed(2)} bps`,
        reason: liquidityCheck.reason,
      } : null
    );
  } catch (error: any) {
    addTest(
      'Liquidity Check',
      false,
      `Failed to check liquidity: ${error.message}`,
      { error: error.message }
    );
  }

  // Test 5: Load Hedge Manager
  try {
    await hedgeManager.loadConfig();
    const config = hedgeManager.getConfig();

    addTest(
      'Hedge Manager',
      true,
      'Hedge manager loaded successfully',
      {
        enabled: config.enabled,
        minSpread: `${(config.minSpreadBps / 100).toFixed(2)}%`,
        maxSlippage: `${(config.maxSlippageBps / 100).toFixed(2)}%`,
        maxPosition: `$${config.maxPositionSize.toLocaleString()}`,
        maxExposure: `$${config.maxUnhedgedExposure.toLocaleString()}`,
      }
    );
  } catch (error: any) {
    addTest(
      'Hedge Manager',
      false,
      `Failed to load hedge manager: ${error.message}`,
      { error: error.message }
    );
  }

  // Test 6: Spread Calculation
  try {
    await hedgeManager.loadConfig();
    const testSize = 100;

    const spreadBps = await hedgeManager.calculateSpread({
      eventId: 'test-event',
      size: testSize,
      volatility: 0.5,
      liquidityScore: 0.7,
    });

    const userPrice = 0.52;
    const { hedgePrice } = hedgeManager.calculateHedgePrices({
      userPrice,
      side: 'buy',
      spreadBps,
    });

    const profitPerShare = userPrice - hedgePrice;
    const totalProfit = profitPerShare * testSize;

    addTest(
      'Spread Calculation',
      true,
      `Spread: ${(spreadBps / 100).toFixed(2)}%, Profit: $${totalProfit.toFixed(2)} for ${testSize} shares`,
      {
        spreadBps,
        spreadPercent: `${(spreadBps / 100).toFixed(2)}%`,
        exampleTrade: {
          userPrice: `$${userPrice.toFixed(4)}`,
          hedgePrice: `$${hedgePrice.toFixed(4)}`,
          profitPerShare: `$${profitPerShare.toFixed(4)}`,
          totalProfitFor100: `$${totalProfit.toFixed(2)}`,
        },
      }
    );
  } catch (error: any) {
    addTest(
      'Spread Calculation',
      false,
      `Failed to calculate spread: ${error.message}`,
      { error: error.message }
    );
  }

  // Final summary
  results.summary.status = results.summary.failed === 0 ? 'PASSED' : 'FAILED';
  results.summary.successRate = `${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`;

  if (results.summary.status === 'PASSED') {
    results.summary.message = '✅ All tests passed! Your Polymarket credentials are working correctly.';
    results.nextSteps = [
      'Go to http://localhost:3000/admin?view=hedging',
      'Click "Enable Hedging" button',
      'Start with small limits (max position: $100, max exposure: $1,000)',
      'Monitor the dashboard closely',
    ];
  } else {
    results.summary.message = '❌ Some tests failed. Please review the errors above.';
    results.nextSteps = [
      'Check all 4 keys are correct in .env file',
      'Restart your dev server',
      'Verify keys are from the same Polymarket account',
      'Check Polymarket API status',
    ];
  }

  return NextResponse.json(results, {
    status: results.summary.status === 'PASSED' ? 200 : 500,
  });
}

