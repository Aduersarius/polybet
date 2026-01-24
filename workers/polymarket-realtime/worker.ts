import { PolymarketRTDSClient } from './lib/rtds';

/**
 * POLYMARKET REAL-TIME WORKER
 * 
 * Persistent process that:
 * 1. Subscribes to live odds from Polymarket RTDS
 * 2. Updates the Database (Events, Outcomes, History)
 * 3. Broadcasts via Redis and Pusher
 */

async function startWorker() {
    console.log('🚀 Initializing Polymarket Real-Time Manager (Standalone Mode)');

    const client = new PolymarketRTDSClient();
    await client.start();

    // Start heartbeat loop for health monitoring
    const { redis } = await import('../../lib/redis');
    setInterval(async () => {
        try {
            if (redis) {
                await redis.setex('worker:polymarket:heartbeat', 60, Date.now().toString());
            }
        } catch (err) {
            console.error('⚠️ Heartbeat failed:', err);
        }
    }, 30000);

    console.log('✅ Worker active. Connected directly to Polymarket RTDS.');
}

// Global error handling
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});

// Graceful shutdown
const shutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down worker...`);
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startWorker().catch(err => {
    console.error('💥 Worker Crashed:', err);
    process.exit(1);
});
