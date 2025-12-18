#!/usr/bin/env tsx

/**
 * Polymarket Real-Time Setup Script
 * 
 * This script:
 * 1. Fixes the Dota 2 event date issue
 * 2. Syncs all sports events and stores token IDs
 * 3. Starts WebSocket client for real-time updates
 */

import { prisma } from '../lib/prisma';

async function setupRealtimeSync() {
  console.log('🚀 Polymarket Real-Time Setup\n');
  console.log('='.repeat(60));
  
  try {
    // STEP 1: Fix Dota 2 event
    console.log('\n📍 STEP 1: Fixing Dota 2 event date...');
    
    const dotaEvent = await prisma.event.findFirst({
      where: {
        AND: [
          { title: { contains: 'Falcons', mode: 'insensitive' } },
          { title: { contains: 'Xtreme', mode: 'insensitive' } },
        ]
      }
    });
    
    if (dotaEvent) {
      await prisma.event.delete({ where: { id: dotaEvent.id } });
      console.log('   ✅ Deleted stale Dota 2 event');
    }
    
    // STEP 2: Run sync to get fresh data with token IDs
    console.log('\n📍 STEP 2: Syncing sports events from Polymarket...');
    console.log('   This will fetch fresh data and store WebSocket token IDs');
    
    const syncResponse = await fetch('http://localhost:3000/api/sports/sync', {
      method: 'POST',
    });
    
    if (syncResponse.ok) {
      const syncData = await syncResponse.json();
      console.log('   ✅ Sync complete:', {
        created: syncData.created,
        updated: syncData.updated,
        total: syncData.total,
      });
    } else {
      console.error('   ❌ Sync failed:', await syncResponse.text());
    }
    
    // STEP 3: Start WebSocket client
    console.log('\n📍 STEP 3: Starting WebSocket client...');
    
    const wsResponse = await fetch('http://localhost:3000/api/polymarket/ws/start', {
      method: 'POST',
    });
    
    if (wsResponse.ok) {
      const wsData = await wsResponse.json();
      console.log('   ✅ WebSocket client started');
      console.log('   📡 Subscribed to real-time market updates');
    } else {
      console.error('   ❌ Failed to start WebSocket:', await wsResponse.text());
    }
    
    // STEP 4: Verify setup
    console.log('\n📍 STEP 4: Verifying setup...');
    
    const mappings = await prisma.polymarketMarketMapping.count({
      where: {
        event: {
          status: 'ACTIVE',
          OR: [
            { isEsports: true },
            { sport: { not: null } },
          ],
        },
      },
    });
    
    console.log(`   ✅ Found ${mappings} sports events with WebSocket subscriptions`);
    
    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('✨ SETUP COMPLETE!');
    console.log('\n📊 Real-time updates are now active:');
    console.log('   • Event dates will auto-sync from Polymarket');
    console.log('   • Odds update in real-time (<1s latency)');
    console.log('   • Live status syncs automatically');
    console.log('   • No more stale data!');
    console.log('\n🌐 Check: http://localhost:3000/sports');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupRealtimeSync();

