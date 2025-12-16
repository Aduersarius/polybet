/**
 * Test Polymarket Connection
 * 
 * This script tests your Polymarket credentials and connection
 * Run with: npx tsx scripts/test-polymarket-connection.ts
 */

// Load environment variables from .env file
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(__dirname, '../.env') });

import { polymarketTrading } from '../lib/polymarket-trading';
import { hedgeManager } from '../lib/hedge-manager';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function success(message: string) {
  log(`✓ ${message}`, COLORS.green);
}

function error(message: string) {
  log(`✗ ${message}`, COLORS.red);
}

function info(message: string) {
  log(`ℹ ${message}`, COLORS.cyan);
}

function warning(message: string) {
  log(`⚠ ${message}`, COLORS.yellow);
}

async function testPolymarketConnection() {
  console.log('\n' + '='.repeat(60));
  log('🧪 TESTING POLYMARKET CONNECTION', COLORS.blue);
  console.log('='.repeat(60) + '\n');

  let allTestsPassed = true;

  // Test 1: Check Environment Variables
  log('\n📋 Test 1: Checking Environment Variables...', COLORS.cyan);
  console.log('-'.repeat(60));
  
  const requiredVars = {
    'POLYMARKET_CLOB_API_URL': process.env.POLYMARKET_CLOB_API_URL,
    'POLYMARKET_API_KEY': process.env.POLYMARKET_API_KEY,
    'POLYMARKET_API_SECRET': process.env.POLYMARKET_API_SECRET,
    'POLYMARKET_PASSPHRASE': process.env.POLYMARKET_PASSPHRASE,
    'POLYMARKET_PRIVATE_KEY': process.env.POLYMARKET_PRIVATE_KEY,
    'POLYMARKET_CHAIN_ID': process.env.POLYMARKET_CHAIN_ID,
  };

  let allVarsSet = true;
  for (const [key, value] of Object.entries(requiredVars)) {
    const isSet = value && 
                  value !== '' && 
                  value !== 'YOUR_API_KEY_HERE' && 
                  value !== 'YOUR_PRIVATE_KEY_HERE' &&
                  value !== 'your_api_key_here' &&
                  value !== 'your_secret_here' &&
                  value !== 'your_passphrase_here' &&
                  value !== 'your_wallet_private_key_here';
    
    if (isSet) {
      // Show partial value for security
      const displayValue = key.includes('KEY') || key.includes('SECRET') || key.includes('PASSPHRASE')
        ? value!.substring(0, 8) + '...' + value!.substring(value!.length - 4)
        : value;
      success(`${key}: ${displayValue}`);
    } else {
      error(`${key}: NOT SET`);
      allVarsSet = false;
      allTestsPassed = false;
    }
  }

  if (!allVarsSet) {
    error('\n❌ Some environment variables are missing!');
    info('Please add all required keys to your .env file');
    info('See SETUP_YOUR_KEYS.md for instructions');
    return;
  }

  // Test 2: Initialize Trading Service
  log('\n🔧 Test 2: Initializing Trading Service...', COLORS.cyan);
  console.log('-'.repeat(60));
  
  try {
    if (polymarketTrading.isEnabled()) {
      success('Trading service initialized successfully');
      success('Wallet initialized with private key');
    } else {
      error('Trading service not enabled - check credentials');
      allTestsPassed = false;
      return;
    }
  } catch (err) {
    error(`Failed to initialize: ${err instanceof Error ? err.message : 'Unknown error'}`);
    allTestsPassed = false;
    return;
  }

  // Test 3: Fetch Orderbook (Test API Connection)
  log('\n📊 Test 3: Testing API Connection (Fetch Orderbook)...', COLORS.cyan);
  console.log('-'.repeat(60));
  
  try {
    // Use a well-known Polymarket market ID for testing
    const testMarketId = '21742'; // A popular market
    info(`Fetching orderbook for market ${testMarketId}...`);
    
    const orderbook = await polymarketTrading.getOrderbook(testMarketId);
    
    if (orderbook && orderbook.bids && orderbook.asks) {
      success('Successfully fetched orderbook from Polymarket!');
      info(`  Bids: ${orderbook.bids.length} levels`);
      info(`  Asks: ${orderbook.asks.length} levels`);
      
      if (orderbook.bids.length > 0) {
        info(`  Best Bid: $${orderbook.bids[0].price.toFixed(4)} (${orderbook.bids[0].size.toFixed(0)} shares)`);
      }
      if (orderbook.asks.length > 0) {
        info(`  Best Ask: $${orderbook.asks[0].price.toFixed(4)} (${orderbook.asks[0].size.toFixed(0)} shares)`);
      }
    } else {
      error('Received empty orderbook - API might not be working correctly');
      allTestsPassed = false;
    }
  } catch (err) {
    error(`Failed to fetch orderbook: ${err instanceof Error ? err.message : 'Unknown error'}`);
    warning('This might be due to:');
    warning('  - Invalid API credentials');
    warning('  - Incorrect API URL');
    warning('  - Network issues');
    warning('  - Polymarket API is down');
    allTestsPassed = false;
  }

  // Test 4: Check Liquidity (More Complex API Call)
  log('\n💧 Test 4: Testing Liquidity Check...', COLORS.cyan);
  console.log('-'.repeat(60));
  
  try {
    const testMarketId = '21742';
    const testSize = 10; // Small test size
    
    info(`Checking liquidity for ${testSize} shares...`);
    
    const liquidityCheck = await polymarketTrading.checkLiquidity(
      testMarketId,
      'BUY',
      testSize,
      100 // 1% max slippage
    );
    
    if (liquidityCheck) {
      success('Liquidity check completed successfully!');
      info(`  Can hedge: ${liquidityCheck.canHedge ? 'YES ✓' : 'NO ✗'}`);
      info(`  Available size: ${liquidityCheck.availableSize.toFixed(2)} shares`);
      info(`  Best price: $${liquidityCheck.bestPrice.toFixed(4)}`);
      info(`  Slippage: ${liquidityCheck.estimatedSlippage.toFixed(2)} bps`);
      
      if (!liquidityCheck.canHedge) {
        warning(`  Reason: ${liquidityCheck.reason}`);
      }
    } else {
      error('Liquidity check returned no data');
      allTestsPassed = false;
    }
  } catch (err) {
    error(`Failed to check liquidity: ${err instanceof Error ? err.message : 'Unknown error'}`);
    allTestsPassed = false;
  }

  // Test 5: Load Hedge Manager Configuration
  log('\n⚙️  Test 5: Testing Hedge Manager...', COLORS.cyan);
  console.log('-'.repeat(60));
  
  try {
    await hedgeManager.loadConfig();
    const config = hedgeManager.getConfig();
    
    success('Hedge manager initialized successfully!');
    info(`  Hedging enabled: ${config.enabled ? 'YES' : 'NO (disabled by default)'}`);
    info(`  Min spread: ${(config.minSpreadBps / 100).toFixed(2)}%`);
    info(`  Max slippage: ${(config.maxSlippageBps / 100).toFixed(2)}%`);
    info(`  Max position: $${config.maxPositionSize.toLocaleString()}`);
    info(`  Max exposure: $${config.maxUnhedgedExposure.toLocaleString()}`);
    
    if (!config.enabled) {
      warning('  Hedging is currently DISABLED');
      info('  Enable it in the admin panel: /admin?view=hedging');
    }
  } catch (err) {
    error(`Failed to load hedge manager: ${err instanceof Error ? err.message : 'Unknown error'}`);
    allTestsPassed = false;
  }

  // Test 6: Calculate Example Spread
  log('\n💰 Test 6: Testing Spread Calculation...', COLORS.cyan);
  console.log('-'.repeat(60));
  
  try {
    await hedgeManager.loadConfig();
    
    const testEventId = 'test-event-123';
    const testSize = 100;
    
    const spreadBps = hedgeManager.calculateSpread({
      eventId: testEventId,
      size: testSize,
      volatility: 0.5,
      liquidityScore: 0.7,
    });
    
    success('Spread calculation working!');
    info(`  For ${testSize} shares: ${(spreadBps / 100).toFixed(2)}% spread (${spreadBps} bps)`);
    
    // Example pricing
    const userPrice = 0.52;
    const { hedgePrice, minAcceptablePrice, maxAcceptablePrice } = hedgeManager.calculateHedgePrices({
      userPrice,
      side: 'buy',
      spreadBps,
    });
    
    info(`\n  Example Trade:`);
    info(`    User buys at: $${userPrice.toFixed(4)}`);
    info(`    We hedge at: $${hedgePrice.toFixed(4)}`);
    info(`    Spread per share: $${(userPrice - hedgePrice).toFixed(4)}`);
    info(`    Profit for 100 shares: $${((userPrice - hedgePrice) * 100).toFixed(2)}`);
  } catch (err) {
    error(`Failed to calculate spread: ${err instanceof Error ? err.message : 'Unknown error'}`);
    allTestsPassed = false;
  }

  // Final Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    log('🎉 ALL TESTS PASSED!', COLORS.green);
    console.log('='.repeat(60));
    console.log();
    success('Your Polymarket credentials are working correctly!');
    console.log();
    log('Next Steps:', COLORS.cyan);
    info('1. Go to admin panel: http://localhost:3000/admin?view=hedging');
    info('2. Click "Enable Hedging" button');
    info('3. Start with small position limits for testing');
    info('4. Monitor the dashboard closely');
    console.log();
    warning('IMPORTANT: Start with LOW limits:');
    info('  - Max position: $100');
    info('  - Max exposure: $1,000');
    info('  - Min spread: 3% (300 bps)');
    console.log();
  } else {
    log('❌ SOME TESTS FAILED', COLORS.red);
    console.log('='.repeat(60));
    console.log();
    error('Please review the errors above and fix them before enabling hedging.');
    console.log();
    log('Common Issues:', COLORS.cyan);
    info('1. Check all 4 keys are correct in .env file');
    info('2. Restart your dev server after adding keys');
    info('3. Verify keys are from the same Polymarket account');
    info('4. Check Polymarket API status (might be down)');
    info('5. Verify your wallet has USDC balance');
    console.log();
  }

  return allTestsPassed;
}

// Run tests
testPolymarketConnection()
  .then((success) => {
    if (success) {
      console.log('✅ Ready to hedge!\n');
      process.exit(0);
    } else {
      console.log('❌ Fix issues before enabling hedging\n');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('\n❌ Fatal error running tests:');
    console.error(err);
    process.exit(1);
  });
