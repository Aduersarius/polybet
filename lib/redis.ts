import Redis from 'ioredis';

// Use the REDIS_URL from env, or default to localhost (for VPS)
// For Vercel, you MUST set REDIS_URL in .env to point to your VPS (e.g. redis://:password@188.137.178.118:6379)
const globalForRedis = global as unknown as { redis: Redis | null };

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

function ensureSecureRedisConfig() {
    if (process.env.NODE_ENV !== 'production') return;

    if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL is required in production');
    }

    const url = process.env.REDIS_URL;
    const isLocalDefault = url.startsWith('redis://localhost') || url.startsWith('redis://127.0.0.1');
    const hasAuth = url.includes('@');
    const usesTls = url.startsWith('rediss://');

    if (isLocalDefault) {
        throw new Error('REDIS_URL must not point to localhost in production');
    }
    if (!hasAuth) {
        throw new Error('REDIS_URL must include authentication credentials in production');
    }
    if (!usesTls) {
        throw new Error('REDIS_URL must use TLS (rediss://) in production');
    }
}

const NO_OP_METHODS = new Set([
    'get',
    'set',
    'setex',
    'del',
    'keys',
    'publish',
    'subscribe',
    'on',
    'incr',
    'decr',
    'expire',
    'dbsize',
    'info',
    'flushdb',
    'lpush',
    'ltrim',
    'zadd',
    'zremrangebyscore',
    'zrangebyscore',
    'lrange',
]);

function createNoOpMethod() {
    return async (...args: any[]) => {
        const callback = args.find((arg) => typeof arg === 'function');
        if (callback) {
            try {
                callback(null, 0);
            } catch {
                // Swallow callback errors in no-op mode
            }
        }
        return null;
    };
}

function createNoOpPipeline() {
    const pipeline = {
        del: () => pipeline,
        setex: () => pipeline,
        set: () => pipeline,
        expire: () => pipeline,
        incr: () => pipeline,
        decr: () => pipeline,
        exec: async () => [],
    } as any;
    return pipeline;
}

// Lazy initialization - only connect when actually used (not during build)
let redisInstance: Redis | null = null;
let connectionAttempted = false;

function getRedisInstance(): Redis | null {
    // Skip Redis during build time
    if (typeof window === 'undefined' && process.env.NEXT_PHASE === 'phase-production-build') {
        return null;
    }

    ensureSecureRedisConfig();

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
            if (prop === 'pipeline') {
                return () => createNoOpPipeline();
            }
            if (typeof prop === 'string' && NO_OP_METHODS.has(prop)) {
                return createNoOpMethod();
            }
            return undefined;
        }
        const value = (instance as any)[prop];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});

