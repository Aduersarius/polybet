import { PolymarketRealtimeClient } from '../../lib/polymarket-realtime';
// v2.0.0 - Migrated to official @polymarket/real-time-data-client library
/**
 * STRIPPED-DOWN POLYMARKET REAL-TIME WORKER
 *
 * Logic has been unified in lib/polymarket-realtime.ts for:
 * 1. Automatic Database Sync (Event/Outcome tables)
 * 2. Automated History tracking (OddsHistory)
 * 3. Real-time Broadcasting (Redis/Pusher)
 *
 * This worker simply acts as the persistent lifecycle manager.
 */
async function startWorker() {
    console.log('🚀 Initializing Polymarket Real-Time Manager...');
    const client = new PolymarketRealtimeClient({
        autoUpdateDb: true // Library handles all the heavy lifting
    });
    // Connect to RTDS (Real-Time Data Service)
    client.connect();
    // Start heartbeat loop
    const { redis } = await import('../../lib/redis');
    setInterval(async () => {
        try {
            if (redis) {
                await redis.setex('worker:polymarket:heartbeat', 60, Date.now().toString());
            }
        }
        catch (err) {
            console.error('⚠️ Heartbeat failed:', err);
        }
    }, 30000);
    console.log('✅ Worker active. Orchestrating real-time updates via official Polymarket RTDS client.');
}
// Global error handling to prevent silent death
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});
startWorker().catch(err => {
    console.error('💥 Worker Crashed:', err);
    process.exit(1);
});
