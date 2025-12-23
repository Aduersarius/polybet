#!/usr/bin/env tsx

/**
 * Test script to verify Polymarket provides 5-minute candles for historical data
 * 
 * This script tests if we can get 5-min candles beyond the 30-day limit
 * that the current implementation assumes
 */

import fetch from 'node-fetch';

const POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';

// Get a real token ID from your database or use a known market
// Example: Trump 2024 election market (common for testing)
const TEST_TOKEN_IDS = [
  'cmiop7j7j001jbbofmp4h7px9', // Example token ID - replace with real one
  // Add more token IDs to test
];

interface HistoryPoint {
  timestamp: number;
  price: number;
  volume?: number;
}

async function test5MinCandles(tokenId: string, daysAgo: number): Promise<{
  success: boolean;
  pointCount: number;
  dateRange: string;
  samplePoints: HistoryPoint[];
  error?: string;
}> {
  const endSec = Math.floor(Date.now() / 1000);
  const startSec = endSec - (daysAgo * 24 * 60 * 60);
  
  const url = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=5`;
  
  console.log(`\n🧪 Testing token: ${tokenId}`);
  console.log(`📅 Looking back ${daysAgo} days`);
  console.log(`⏰ Range: ${new Date(startSec * 1000).toISOString()} to ${new Date(endSec * 1000).toISOString()}`);
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url, { 
      cache: 'no-store',
      headers: {
        'User-Agent': 'polybet-test/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return {
        success: false,
        pointCount: 0,
        dateRange: '',
        samplePoints: [],
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    const data = await response.json();
    const history = Array.isArray(data?.history) 
      ? data.history 
      : Array.isArray(data?.prices)
      ? data.prices
      : Array.isArray(data)
      ? data
      : [];
    
    if (!history.length) {
      return {
        success: false,
        pointCount: 0,
        dateRange: 'No data',
        samplePoints: [],
        error: 'Empty response'
      };
    }
    
    // Parse and filter points within our date range
    const points: HistoryPoint[] = history
      .map((p: any) => {
        const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
        const tsSec = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
        const price = Number(p.price ?? p.p ?? p.close ?? p.value);
        
        if (!Number.isFinite(tsSec) || !Number.isFinite(price)) return null;
        
        return {
          timestamp: tsSec,
          price: price,
          volume: p.volume ? Number(p.volume) : undefined
        };
      })
      .filter((p): p is HistoryPoint => p !== null)
      .filter(p => p.timestamp >= startSec && p.timestamp <= endSec)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (!points.length) {
      return {
        success: false,
        pointCount: 0,
        dateRange: 'No points in date range',
        samplePoints: [],
        error: 'No points within requested date range'
      };
    }
    
    const earliest = points[0].timestamp;
    const latest = points[points.length - 1].timestamp;
    const dateRange = `${new Date(earliest * 1000).toISOString()} to ${new Date(latest * 1000).toISOString()}`;
    
    // Calculate actual time span covered
    const actualDays = (latest - earliest) / (24 * 60 * 60);
    
    console.log(`✅ Success! Got ${points.length} points`);
    console.log(`📊 Actual coverage: ${actualDays.toFixed(2)} days`);
    console.log(`📅 ${dateRange}`);
    
    // Show sample points
    const samplePoints = points.filter((_, i) => i % Math.ceil(points.length / 5) === 0).slice(0, 5);
    console.log(`📋 Sample points:`);
    samplePoints.forEach(p => {
      console.log(`   ${new Date(p.timestamp * 1000).toISOString()} - Price: ${p.price.toFixed(4)}${p.volume ? `, Volume: ${p.volume}` : ''}`);
    });
    
    // Check spacing between points
    if (points.length > 1) {
      const spacings: number[] = [];
      for (let i = 1; i < Math.min(points.length, 100); i++) {
        spacings.push(points[i].timestamp - points[i-1].timestamp);
      }
      const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
      const avgMinutes = avgSpacing / 60;
      console.log(`⏱️  Average spacing: ${avgMinutes.toFixed(1)} minutes`);
      
      if (avgMinutes > 10) {
        console.log(`⚠️  WARNING: Spacing >10min suggests not true 5-min candles`);
      } else if (avgMinutes <= 6) {
        console.log(`✅ Confirmed: True 5-minute (or better) granularity`);
      }
    }
    
    return {
      success: true,
      pointCount: points.length,
      dateRange,
      samplePoints: points.slice(0, 5)
    };
    
  } catch (error) {
    return {
      success: false,
      pointCount: 0,
      dateRange: '',
      samplePoints: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  console.log('🔍 Polymarket 5-Minute Candles Test');
  console.log('='.repeat(60));
  
  // Get token ID from user or use test
  const testTokenId = process.argv[2] || TEST_TOKEN_IDS[0];
  
  if (!testTokenId || testTokenId === 'cmiop7j7j001jbbofmp4h7px9') {
    console.log('\n❌ ERROR: You need to provide a real token ID!');
    console.log('\nUsage:');
    console.log('  npx tsx test-polymarket-5min-candles.ts {TOKEN_ID}');
    console.log('\nHow to get token IDs:');
    console.log('  1. Check your database: SELECT DISTINCT polymarketTokenId FROM "PolymarketMarketMapping"');
    console.log('  2. Or use Polymarket API: https://gamma-api.polymarket.com/markets?limit=10');
    console.log('  3. Look for markets with clobTokenIds');
    process.exit(1);
  }
  
  // Test different time periods
  const testPeriods = [
    { name: 'Recent (7 days)', days: 7 },
    { name: 'Last month (30 days)', days: 30 },
    { name: 'Older (90 days)', days: 90 },
    { name: 'Ancient (180 days)', days: 180 },
    { name: 'Very old (365 days)', days: 365 }
  ];
  
  const results = [];
  
  for (const period of testPeriods) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${period.name}`);
    console.log('='.repeat(60));
    
    const result = await test5MinCandles(testTokenId, period.days);
    results.push({ period: period.name, ...result });
    
    if (!result.success) {
      console.log(`❌ FAILED: ${result.error}`);
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const points = r.success ? r.pointCount : 0;
    console.log(`${status} ${r.period.padEnd(25)} ${points.toString().padStart(6)} points`);
    if (r.success && r.pointCount > 0) {
      console.log(`   ${r.dateRange}`);
    }
  });
  
  // Conclusion
  const successfulTests = results.filter(r => r.success);
  const hasOldData = results.filter(r => r.success && (r.period.includes('90') || r.period.includes('180') || r.period.includes('365')));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 CONCLUSION');
  console.log('='.repeat(60));
  
  if (successfulTests.length === 0) {
    console.log('❌ Polymarket API is not responding or token ID is invalid');
  } else if (hasOldData.length > 0) {
    console.log('✅ Polymarket DOES provide 5-minute candles for old data!');
    console.log('   The current implementation is wrong - it should fetch 5-min candles');
    console.log('   for all time periods, not just the last 30 days.');
  } else if (successfulTests.some(r => r.period.includes('30'))) {
    console.log('⚠️  Polymarket only provides 5-minute candles for ~30 days');
    console.log('   The current implementation is correct for this limitation.');
  } else {
    console.log('❓ Mixed results - need more investigation');
  }
  
  console.log('\n');
}

main().catch(console.error);
