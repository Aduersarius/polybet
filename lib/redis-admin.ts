import { Redis } from 'ioredis';

let redisClient: Redis | null = null;
let connectionAttempted = false;

export function getRedisClient(): Redis {
    if (!redisClient && !connectionAttempted) {
        connectionAttempted = true;
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 3) {
                    console.log('⚠️ Redis Admin connection failed after 3 retries');
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 2000);
            },
            lazyConnect: true,
        });

        // Add error handling
        redisClient.on('error', (err) => {
            const errorMsg = err.message || String(err);
            if (errorMsg.includes('WRONGPASS') || errorMsg.includes('invalid password') || errorMsg.includes('NOAUTH')) {
                console.error('🔴 Redis Admin Authentication Error: Invalid password or credentials. Check REDIS_URL format: redis://:password@host:port');
                redisClient = null;
                connectionAttempted = false;
            } else {
                console.error('🔴 Redis Admin Error:', errorMsg);
            }
        });

        redisClient.on('ready', () => {
            console.log('🟢 Redis Admin connected and authenticated successfully');
        });

        // Attempt connection
        redisClient.connect().catch((err) => {
            const errorMsg = err.message || String(err);
            if (errorMsg.includes('WRONGPASS') || errorMsg.includes('invalid password') || errorMsg.includes('NOAUTH')) {
                console.error('🔴 Redis Admin Authentication Failed: Invalid password or credentials. Check REDIS_URL format: redis://:password@host:port');
                redisClient = null;
                connectionAttempted = false;
            } else {
                console.error('⚠️ Redis Admin connection failed:', errorMsg);
            }
        });
    }
    return redisClient!;
}

export async function publishAdminEvent(eventType: string, payload?: any) {
    try {
        const redis = getRedisClient();
        if (!redis) {
            console.warn(`⚠️ [Redis Admin] No Redis client available, skipping admin event broadcast: ${eventType}`);
            return;
        }

        // Check connection status
        const status = redis.status;
        if (status !== 'ready' && status !== 'connect') {
            console.warn(`⚠️ [Redis Admin] Redis not ready (status: ${status}), skipping admin event broadcast: ${eventType}`);
            // Try to connect if not already connecting/connected
            if (status === 'end' || status === 'close') {
                console.log(`🔄 [Redis Admin] Attempting to reconnect Redis...`);
                redis.connect().catch((err) => {
                    console.error(`❌ [Redis Admin] Failed to reconnect:`, err);
                });
            }
            return;
        }

        const message = JSON.stringify({
            type: eventType,
            payload: payload || {},
            timestamp: new Date().toISOString()
        });

        console.log(`📡 [Redis Admin] Publishing to 'admin-events' channel:`, { type: eventType, payload });
        const result = await redis.publish('admin-events', message);
        console.log(`✅ [Redis Admin] Published successfully to Redis, ${result} subscriber(s) received the message`);

        // Also publish via Pusher (Soketi) for Frontend
        try {
            const { getPusherServer } = await import('@/lib/pusher-server');
            const pusherServer = getPusherServer();
            // Prefix eventType with 'admin:' if not already present
            const pusherEventName = eventType.startsWith('admin:') ? eventType : `admin:${eventType}`;
            await pusherServer.trigger('admin-events', pusherEventName, payload || {});
            console.log(`✅ [Redis Admin] Published successfully to Pusher/Soketi: ${pusherEventName}`);
        } catch (pusherErr) {
            console.error('❌ [Redis Admin] Failed to publish Pusher admin event:', pusherErr);
        }
    } catch (error) {
        console.error('❌ [Redis Admin] Failed to publish admin event:', error);
        // Don't throw - allow the request to complete even if broadcast fails
    }
}
