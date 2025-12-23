#!/usr/bin/env tsx

/**
 * Get real token IDs from your database for testing
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('🔍 Fetching token IDs from database...\n');

  try {
    // Get mappings with token IDs
    const mappings = await prisma.polymarketMarketMapping.findMany({
      where: {
        isActive: true,
        OR: [
          { yesTokenId: { not: null } },
          { noTokenId: { not: null } }
        ]
      },
      take: 10,
      select: {
        polymarketId: true,
        yesTokenId: true,
        noTokenId: true,
        internalEventId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (mappings.length === 0) {
      console.log('❌ No active mappings found in database');
      console.log('\nYou need to:');
      console.log('1. Run the intake flow first: /admin/intake');
      console.log('2. Approve some markets');
      console.log('3. Or check if your database has any data');
      process.exit(1);
    }

    // Also get event titles if available
    const eventIds = mappings.map((m: any) => m.internalEventId);
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, title: true, createdAt: true }
    });

    const eventMap: Map<string, any> = new Map(events.map((e: any) => [e.id, e]));

    console.log('📋 Available token IDs for testing:\n');

    mappings.forEach((m: any, i: number) => {
      const event: any = eventMap.get(m.internalEventId);
      console.log(`${i + 1}. ${m.polymarketId}`);
      console.log(`   Event: ${event?.title?.substring(0, 60) || 'Unknown'}`);
      console.log(`   YES Token: ${m.yesTokenId || 'None'}`);
      console.log(`   NO Token: ${m.noTokenId || 'None'}`);
      console.log(`   Internal ID: ${m.internalEventId}`);
      console.log(`   Created: ${m.createdAt?.toISOString().split('T')[0]}`);
      console.log('');
    });

    console.log('💡 Usage:');
    console.log('   npx tsx test-polymarket-5min-candles.ts {TOKEN_ID}');
    console.log('');
    console.log('Example:');
    if (mappings[0]?.yesTokenId) {
      console.log(`   npx tsx test-polymarket-5min-candles.ts ${mappings[0].yesTokenId}`);
    }

    // Show how to get more token IDs
    console.log('\n🔍 To find more token IDs:');
    console.log('   SELECT polymarketId, yesTokenId, noTokenId FROM "PolymarketMarketMapping" WHERE isActive = true');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main(); export { };
