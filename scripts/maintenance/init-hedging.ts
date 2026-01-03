/**
 * Initialize Hedging System
 * 
 * This script helps set up the hedging system with default configuration
 * Run with: npx tsx scripts/init-hedging.ts
 */

import { prisma } from '../../lib/prisma';
import { hedgeManager } from '../../lib/hedge-manager';

async function initializeHedging() {
  console.log('🚀 Initializing Polymarket Hedging System...\n');

  try {
    // 1. Check database connection
    console.log('✓ Checking database connection...');
    await prisma.$connect();
    console.log('  Database connected ✓\n');

    // 2. Initialize default configuration
    console.log('✓ Setting up default configuration...');
    
    const defaultConfigs = [
      { key: 'enabled', value: false, description: 'Hedging enabled (disabled by default for safety)' },
      { key: 'minSpreadBps', value: 200, description: 'Minimum spread in basis points (2%)' },
      { key: 'maxSlippageBps', value: 100, description: 'Maximum acceptable slippage (1%)' },
      { key: 'maxUnhedgedExposure', value: 10000, description: 'Max USD value of unhedged positions' },
      { key: 'maxPositionSize', value: 1000, description: 'Max size for single hedge ($1k)' },
      { key: 'hedgeTimeoutMs', value: 5000, description: 'Time to wait for hedge (5 seconds)' },
      { key: 'retryAttempts', value: 3, description: 'Number of retry attempts' },
      // Order Splitting (Slippage Laddering) Configuration
      { key: 'maxChunkSize', value: 100, description: 'Max size per chunk for order splitting ($100)' },
      { key: 'minChunkSize', value: 10, description: 'Min size per chunk ($10)' },
      { key: 'delayBetweenChunks', value: 2000, description: 'Delay between chunks in ms (2 seconds)' },
      { key: 'maxSlippagePerChunk', value: 50, description: 'Max slippage per chunk (0.5%)' },
      { key: 'adaptiveSizing', value: true, description: 'Adjust chunk size based on market conditions' },
    ];

    for (const config of defaultConfigs) {
      await prisma.hedgeConfig.upsert({
        where: { key: config.key },
        create: {
          key: config.key,
          value: config.value,
          description: config.description,
        },
        update: {
          // Don't overwrite if already exists
        },
      });
      console.log(`  - ${config.key}: ${config.value} (${config.description})`);
    }
    console.log('  Configuration initialized ✓\n');

    // 3. Check environment variables
    console.log('✓ Checking environment variables...');
    const requiredVars = [
      'POLYMARKET_CLOB_API_URL',
      'POLYMARKET_API_KEY',
      'POLYMARKET_PRIVATE_KEY',
      'POLYMARKET_CHAIN_ID',
    ];

    let allVarsSet = true;
    for (const varName of requiredVars) {
      const value = process.env[varName];
      const isSet = value && value !== 'YOUR_API_KEY_HERE' && value !== 'YOUR_PRIVATE_KEY_HERE';
      console.log(`  - ${varName}: ${isSet ? '✓ Set' : '✗ Not set'}`);
      if (!isSet) allVarsSet = false;
    }
    console.log();

    if (!allVarsSet) {
      console.log('⚠️  WARNING: Some environment variables are not configured');
      console.log('   Hedging will remain disabled until credentials are set');
      console.log('   See HEDGING_SETUP.md for instructions\n');
    }

    // 4. Test Polymarket connection
    if (allVarsSet) {
      console.log('✓ Testing Polymarket connection...');
      const { polymarketTrading } = await import('../../lib/polymarket-trading');
      
      if (polymarketTrading.isEnabled()) {
        console.log('  Polymarket trading service initialized ✓');
        
        // Try to fetch a test orderbook
        try {
          // Use a known Polymarket market ID for testing
          await polymarketTrading.getOrderbook('21742');
          console.log('  Orderbook fetch test successful ✓');
        } catch (error) {
          console.log('  ⚠️ Orderbook fetch failed - check API credentials');
          console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.log('  ⚠️ Polymarket trading not enabled - check credentials');
      }
      console.log();
    }

    // 5. Create example market mapping (commented out)
    console.log('✓ Market Mapping Example:');
    console.log('  To map your internal events to Polymarket markets, run:\n');
    console.log('  INSERT INTO "PolymarketMarketMapping" (');
    console.log('    id, "internalEventId", "polymarketId",');
    console.log('    "polymarketConditionId", "polymarketTokenId", "isActive"');
    console.log('  ) VALUES (');
    console.log('    gen_random_uuid(),');
    console.log('    \'your-event-id\',');
    console.log('    \'polymarket-market-id\',');
    console.log('    \'0x...\', -- condition ID from CLOB API');
    console.log('    \'0x...\', -- token contract address');
    console.log('    true');
    console.log('  );\n');

    // 6. Display next steps
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Hedging System Initialized Successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Next Steps:\n');
    
    if (!allVarsSet) {
      console.log('1. Set up environment variables (see HEDGING_SETUP.md)');
      console.log('   - Get Polymarket API credentials');
      console.log('   - Set up proxy wallet');
      console.log('   - Add credentials to .env file\n');
    }

    console.log('2. Create market mappings');
    console.log('   - Map your events to Polymarket markets');
    console.log('   - Use the SQL example above\n');

    console.log('3. Enable hedging (when ready)');
    console.log('   curl -X POST http://localhost:3000/api/hedge/config \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"key": "enabled", "value": true}\'\n');

    console.log('4. Monitor dashboard');
    console.log('   curl http://localhost:3000/api/hedge/dashboard?period=24h\n');

    console.log('📖 For detailed instructions, see: HEDGING_SETUP.md\n');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run initialization
initializeHedging()
  .then(() => {
    console.log('✅ Initialization complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

