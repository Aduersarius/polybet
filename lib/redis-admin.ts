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
        await redis.publish('admin-events', JSON.stringify({
            type: eventType,
            payload: payload || {},
            timestamp: new Date().toISOString()
        }));
    } catch (error) {
        console.error('Failed to publish admin event:', error);
    }
}
