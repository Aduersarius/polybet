#!/usr/bin/env tsx

/**
 * Quick test: Does Polymarket provide 5-min candles for old data?
 * 
 * Usage: npx tsx quick-candle-test.ts {TOKEN_ID}
 */

const POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';

async function testCandleAvailability(tokenId: string, daysAgo: number): Promise<boolean> {
  const url = `${POLYMARKET_CLOB_API_URL}/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=5`;

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'polybet-test/1.0' }
    });

    if (!response.ok) return false;

    const data = await response.json();
    const history = Array.isArray(data?.history) ? data.history :
      Array.isArray(data?.prices) ? data.prices :
        Array.isArray(data) ? data : [];

    if (!history.length) return false;

    // Check if we have data older than daysAgo
    const oldest = Math.min(...history.map((p: any) => {
      const ts = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
      return ts > 1e12 ? Math.floor(ts / 1000) : ts;
    }));

    const cutoff = Math.floor(Date.now() / 1000) - (daysAgo * 24 * 60 * 60);
    return oldest < cutoff;

  } catch {
    return false;
  }
}

async function main() {
  const tokenId = process.argv[2];

  if (!tokenId) {
    console.log('Usage: npx tsx quick-candle-test.ts {TOKEN_ID}');
    console.log('\nGet a token ID from Polymarket:');
    console.log('curl "https://gamma-api.polymarket.com/markets?limit=5" | jq ".[].clobTokenIds"');
    process.exit(1);
  }

  console.log(`Testing token: ${tokenId.substring(0, 20)}...`);
  console.log('='.repeat(50));

  const tests = [
    { name: '7 days', days: 7 },
    { name: '30 days', days: 30 },
    { name: '90 days', days: 90 },
    { name: '180 days', days: 180 }
  ];

  for (const test of tests) {
    const hasData = await testCandleAvailability(tokenId, test.days);
    console.log(`${hasData ? '✅' : '❌'} ${test.name.padEnd(10)} ${hasData ? 'Data available' : 'No data'}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('If you see ✅ for 90+ days, Polymarket provides 5-min candles for old data.');
  console.log('If you see ❌ for 90+ days, current implementation is correct.');
}


main();

export { };