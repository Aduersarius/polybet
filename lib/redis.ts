import Redis from 'ioredis';

// Use the REDIS_URL from env, or default to localhost (for VPS)
// For Vercel, you MUST set REDIS_URL in .env to point to your VPS (e.g. redis://:password@188.137.178.118:6379)
const globalForRedis = global as unknown as { redis: Redis | null };

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Lazy initialization - only connect when actually used (not during build)
let redisInstance: Redis | null = null;
let connectionAttempted = false;

function getRedisInstance(): Redis | null {
    // Skip Redis during build time
    if (typeof window === 'undefined' && process.env.NEXT_PHASE === 'phase-production-build') {
        return null;
    }

    // Return existing instance
    if (redisInstance) {
        return redisInstance;
    }

    // Return cached global instance in development
    if (process.env.NODE_ENV !== 'production' && globalForRedis.redis) {
        return globalForRedis.redis;
    }

    // Only attempt connection once
    if (connectionAttempted) {
        return null;
    }

    connectionAttempted = true;

    try {
        // Silent initialization - errors logged only on failure
        redisInstance = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 3) {
                    console.log('⚠️ Redis connection failed after 3 retries, disabling Redis');
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 2000);
            },
            lazyConnect: true, // Don't connect immediately
        });

        // Add error handling
        redisInstance.on('error', (err) => {
            console.error('🔴 Redis Error:', err.message);
            // Don't throw, just log - make Redis optional
        });

        redisInstance.on('connect', () => {
            console.log('🟢 Redis connected successfully');
        });

        redisInstance.on('ready', () => {
            console.log('🟢 Redis ready');
        });

        // Attempt connection
        redisInstance.connect().catch((err) => {
            console.error('⚠️ Redis connection failed:', err.message);
            redisInstance = null;
        });

        if (process.env.NODE_ENV !== 'production') {
            globalForRedis.redis = redisInstance;
        }

        return redisInstance;
    } catch (error) {
        console.error('🔴 Failed to create Redis instance:', error);
        return null;
    }
}

// Export getter function instead of direct instance
export const redis = new Proxy({} as Redis, {
    get(target, prop) {
        const instance = getRedisInstance();
        if (!instance) {
            // Return no-op functions for common Redis methods
            if (typeof prop === 'string' && ['get', 'set', 'setex', 'del', 'keys', 'publish', 'subscribe', 'on'].includes(prop)) {
                return async (...args: any[]) => null;
            }
            return undefined;
        }
        const value = (instance as any)[prop];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});

