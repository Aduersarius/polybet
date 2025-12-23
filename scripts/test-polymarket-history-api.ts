/**
 * Test script to find the best Polymarket API approach for fetching full historical data
 * Run with: npx tsx scripts/test-polymarket-history-api.ts <tokenId>
 */

const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';

interface TestResult {
  method: string;
  params: Record<string, string | number>;
  success: boolean;
  pointCount: number;
  earliestDate?: Date;
  latestDate?: Date;
  daysCovered?: number;
  error?: string;
  responseTime?: number;
}

async function testApiCall(
  method: string,
  params: Record<string, string | number>
): Promise<TestResult> {
  const startTime = Date.now();
  const queryString = new URLSearchParams(
    Object.entries(params).reduce((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {} as Record<string, string>)
  ).toString();
  const url = `${POLYMARKET_CLOB_API_URL}/prices-history?${queryString}`;

  try {
    const resp = await fetch(url, { cache: 'no-store' });
    const responseTime = Date.now() - startTime;

    if (!resp.ok) {
      return {
        method,
        params,
        success: false,
        pointCount: 0,
        error: `HTTP ${resp.status}: ${resp.statusText}`,
        responseTime,
      };
    }

    const data = await resp.json();
    const history = Array.isArray(data?.history)
      ? data.history
      : Array.isArray(data?.prices)
      ? data.prices
      : Array.isArray(data)
      ? data
      : [];

    if (history.length === 0) {
      return {
        method,
        params,
        success: true,
        pointCount: 0,
        error: 'Empty response',
        responseTime,
      };
    }

    // Extract timestamps
    const timestamps = history
      .map((p: any) => {
        const tsRaw = Number(p.timestamp ?? p.time ?? p.ts ?? p.t);
        return tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw;
      })
      .filter((ts: number) => Number.isFinite(ts))
      .sort((a: number, b: number) => a - b);

    if (timestamps.length === 0) {
      return {
        method,
        params,
        success: true,
        pointCount: history.length,
        error: 'No valid timestamps found',
        responseTime,
      };
    }

    const earliest = new Date(timestamps[0] * 1000);
    const latest = new Date(timestamps[timestamps.length - 1] * 1000);
    const daysCovered = (timestamps[timestamps.length - 1] - timestamps[0]) / (24 * 60 * 60);

    return {
      method,
      params,
      success: true,
      pointCount: history.length,
      earliestDate: earliest,
      latestDate: latest,
      daysCovered,
      responseTime,
    };
  } catch (error: any) {
    return {
      method,
      params,
      success: false,
      pointCount: 0,
      error: error.message || String(error),
      responseTime: Date.now() - startTime,
    };
  }
}

async function runTests(tokenId: string) {
  console.log(`\n🔬 Testing Polymarket API approaches for token: ${tokenId}\n`);
  console.log('=' .repeat(80));

  const results: TestResult[] = [];

  // Test 1: interval=max with various fidelity values
  console.log('\n📊 Test 1: interval=max with different fidelity values\n');
  const fidelityValues = [5, 10, 60, 60 * 6, 60 * 12, 60 * 24]; // 5min, 10min, 1h, 6h, 12h, 24h
  for (const fidelity of fidelityValues) {
    const result = await testApiCall('interval=max', {
      market: tokenId,
      interval: 'max',
      fidelity,
    });
    results.push(result);
    console.log(
      `  ✓ fidelity=${fidelity}min: ${result.success ? '✅' : '❌'} ${result.pointCount} points, ` +
        `${result.daysCovered?.toFixed(1) || 'N/A'} days ` +
        `${result.earliestDate ? `(${result.earliestDate.toISOString().split('T')[0]} to ${result.latestDate?.toISOString().split('T')[0]})` : ''} ` +
        `${result.responseTime}ms ${result.error ? `- ${result.error}` : ''}`
    );
    await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limiting
  }

  // Test 2: interval values (1m, 1w, 1d, 6h, 1h, max)
  console.log('\n📊 Test 2: Different interval values with fidelity=5\n');
  const intervals = ['1m', '1w', '1d', '6h', '1h', 'max'];
  for (const interval of intervals) {
    const result = await testApiCall(`interval=${interval}`, {
      market: tokenId,
      interval,
      fidelity: 5,
    });
    results.push(result);
    console.log(
      `  ✓ interval=${interval}: ${result.success ? '✅' : '❌'} ${result.pointCount} points, ` +
        `${result.daysCovered?.toFixed(1) || 'N/A'} days ` +
        `${result.earliestDate ? `(${result.earliestDate.toISOString().split('T')[0]} to ${result.latestDate?.toISOString().split('T')[0]})` : ''} ` +
        `${result.responseTime}ms ${result.error ? `- ${result.error}` : ''}`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Test 3: Old API format with date ranges (test if it works for longer periods)
  console.log('\n📊 Test 3: Old API format (resolution + date range)\n');
  const now = Math.floor(Date.now() / 1000);
  const testRanges = [
    { days: 7, name: '7 days' },
    { days: 30, name: '30 days' },
    { days: 90, name: '90 days' },
    { days: 180, name: '180 days' },
    { days: 365, name: '365 days' },
  ];

  for (const range of testRanges) {
    const startSec = now - range.days * 24 * 60 * 60;
    const result = await testApiCall('old-format-date-range', {
      market: tokenId,
      resolution: '5m',
      startTs: startSec,
      endTs: now,
    });
    results.push(result);
    console.log(
      `  ✓ ${range.name}: ${result.success ? '✅' : '❌'} ${result.pointCount} points, ` +
        `${result.daysCovered?.toFixed(1) || 'N/A'} days ` +
        `${result.responseTime}ms ${result.error ? `- ${result.error}` : ''}`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Test 4: Chunked approach (simulate what we'd do)
  console.log('\n📊 Test 4: Chunked approach (7-day chunks going backwards)\n');
  const chunkDays = 7;
  const chunkSeconds = chunkDays * 24 * 60 * 60;
  let currentEnd = now;
  const chunkResults: TestResult[] = [];
  let totalChunkPoints = 0;
  const maxChunks = 10; // Limit to avoid too many requests

  for (let i = 0; i < maxChunks; i++) {
    const chunkStart = currentEnd - chunkSeconds;
    const result = await testApiCall('chunked-7days', {
      market: tokenId,
      resolution: '5m',
      startTs: chunkStart,
      endTs: currentEnd,
    });
    chunkResults.push(result);
    if (result.success && result.pointCount > 0) {
      totalChunkPoints += result.pointCount;
      console.log(
        `  ✓ Chunk ${i + 1} (${new Date(chunkStart * 1000).toISOString().split('T')[0]} to ${new Date(currentEnd * 1000).toISOString().split('T')[0]}): ` +
          `${result.pointCount} points, ${result.daysCovered?.toFixed(1) || 'N/A'} days`
      );
    } else {
      console.log(`  ✗ Chunk ${i + 1}: Failed - ${result.error}`);
      break; // Stop if chunk fails
    }
    currentEnd = chunkStart;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SUMMARY\n');

  const successfulResults = results.filter((r) => r.success && r.pointCount > 0);
  const sortedByDays = [...successfulResults].sort((a, b) => (b.daysCovered || 0) - (a.daysCovered || 0));
  const sortedByPoints = [...successfulResults].sort((a, b) => b.pointCount - a.pointCount);

  console.log('🏆 Best by days covered:');
  sortedByDays.slice(0, 3).forEach((r, i) => {
    console.log(
      `  ${i + 1}. ${r.method} (${JSON.stringify(r.params)}): ${r.daysCovered?.toFixed(1)} days, ${r.pointCount} points`
    );
  });

  console.log('\n🏆 Best by point count:');
  sortedByPoints.slice(0, 3).forEach((r, i) => {
    console.log(
      `  ${i + 1}. ${r.method} (${JSON.stringify(r.params)}): ${r.pointCount} points, ${r.daysCovered?.toFixed(1)} days`
    );
  });

  if (totalChunkPoints > 0) {
    console.log(`\n📦 Chunked approach total: ${totalChunkPoints} points across ${chunkResults.filter((r) => r.success).length} chunks`);
  }

  // Recommendation
  console.log('\n💡 RECOMMENDATION:\n');
  const bestResult = sortedByDays[0];
  if (bestResult) {
    console.log(`  Use: ${bestResult.method}`);
    console.log(`  Parameters: ${JSON.stringify(bestResult.params, null, 2)}`);
    console.log(`  Returns: ${bestResult.daysCovered?.toFixed(1)} days, ${bestResult.pointCount} points`);
    
    if ((bestResult.daysCovered || 0) < 180) {
      console.log(`\n  ⚠️  WARNING: Only ${bestResult.daysCovered?.toFixed(1)} days returned.`);
      console.log(`  💡 Consider using chunked approach for full history.`);
    }
  } else {
    console.log('  ❌ No successful results found. Check API access and token ID.');
  }

  return { results, bestResult, chunkResults };
}

// Main
const tokenId = process.argv[2];
if (!tokenId) {
  console.error('Usage: npx tsx scripts/test-polymarket-history-api.ts <tokenId>');
  console.error('\nExample:');
  console.error('  npx tsx scripts/test-polymarket-history-api.ts 21742633143463906290569050155826241533067272736897614950488156847949938836455');
  process.exit(1);
}

runTests(tokenId)
  .then(() => {
    console.log('\n✅ Testing complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });


