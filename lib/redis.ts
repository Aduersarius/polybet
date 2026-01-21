import Redis from 'ioredis';
import { env, isProd } from './env';
import { redisCommandCounter, redisDurationHistogram } from './metrics';

// Use the REDIS_URL from env, or default to localhost (for VPS)
const globalForRedis = global as unknown as { redis: Redis | null; isReady?: boolean };

const redisUrl = env.REDIS_URL;

export function buildTlsConfig(url?: string) {
    const targetUrl = url || redisUrl;
    if (!targetUrl.startsWith('rediss://')) return undefined;

    const tls: Record<string, any> = {};

    if (env.REDIS_ALLOW_SELF_SIGNED) {
        tls.rejectUnauthorized = false;
        console.log('[Redis] 🛡️ Scoped TLS bypass enabled (rejectUnauthorized: false)');
    }

    // Check for CA in process.env (legacy support or custom)
    const caB64 = process.env.REDIS_TLS_CA_BASE64;
    if (caB64) {
        try {
            tls.ca = Buffer.from(caB64, 'base64');
        } catch (err) {
            console.warn('⚠️ Failed to parse REDIS_TLS_CA_BASE64, ignoring', err);
        }
    }
    // Some providers require an empty object if no special config needed for rediss://
    return Object.keys(tls).length ? tls : {};
}

function ensureSecureRedisConfig() {
    if (!isProd) return;

    const isLocalDefault = redisUrl.startsWith('redis://localhost') || redisUrl.startsWith('redis://127.0.0.1');
    const hasAuth = redisUrl.includes('@');
    const usesTls = redisUrl.startsWith('rediss://');

    if (isLocalDefault) {
        throw new Error('REDIS_URL must not point to localhost in production');
    }
    if (!hasAuth) {
        throw new Error('REDIS_URL must include authentication credentials in production');
    }
    // Require TLS for production security
    if (!usesTls) {
        throw new Error('REDIS_URL must use TLS (rediss://) in production for security');
    }
}

const NO_OP_METHODS = new Set([
    'get',
    'getBuffer',
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
        const tls = buildTlsConfig(redisUrl);

        redisInstance = new Redis(redisUrl, {
            // Increased retries for production workers to prevent crashes during brief TLS hiccups
            maxRetriesPerRequest: process.env.NODE_ENV === 'production' ? 20 : 3,
            retryStrategy(times) {
                const maxTimes = process.env.NODE_ENV === 'production' ? 10 : 3;
                if (times > maxTimes) {
                    console.error(`⚠️ Redis connection failed after ${times} retries`);
                    return null;
                }
                return Math.min(times * 200, 5000);
            },
            lazyConnect: true,
            tls,
            // Add connect timeout
            connectTimeout: 10000,
        });

        // Add error handling
        redisInstance.on('error', (err) => {
            const errorMsg = err.message || String(err);
            // Distinguish between connection and authentication errors
            if (errorMsg.includes('WRONGPASS') || errorMsg.includes('invalid password') || errorMsg.includes('NOAUTH')) {
                console.error('🔴 Redis Authentication Error: Invalid password or credentials. Check REDIS_URL format: redis://:password@host:port');
                // Don't retry on auth errors - they won't succeed
                redisInstance = null;
                connectionAttempted = false; // Allow retry after fixing credentials
            } else {
                console.error('🔴 Redis Error:', errorMsg);
            }
            // Don't throw, just log - make Redis optional
        });

        redisInstance.on('connect', () => {
            // Don't log here - connection is just TCP, auth happens next
            // Only log on 'ready' which means auth succeeded
        });

        redisInstance.on('ready', () => {
            if (!globalForRedis.isReady) {
                console.log('🟢 Redis connected and authenticated successfully');
                globalForRedis.isReady = true;
            }
        });

        // Attempt connection
        redisInstance.connect().catch((err) => {
            const errorMsg = err.message || String(err);
            if (errorMsg.includes('WRONGPASS') || errorMsg.includes('invalid password') || errorMsg.includes('NOAUTH')) {
                console.error('🔴 Redis Authentication Failed: Invalid password or credentials. Check REDIS_URL format: redis://:password@host:port');
                redisInstance = null;
                connectionAttempted = false; // Allow retry after fixing credentials
            } else {
                console.error('⚠️ Redis connection failed:', errorMsg);
            }
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
        if (typeof value === 'function') {
            const originalMethod = value.bind(instance);
            return async (...args: any[]) => {
                const start = performance.now();
                const cmd = String(prop);
                try {
                    const result = await originalMethod(...args);
                    const duration = performance.now() - start;
                    redisCommandCounter.add(1, { command: cmd, status: 'success' });
                    redisDurationHistogram.record(duration, { command: cmd, status: 'success' });
                    return result;
                } catch (error) {
                    const duration = performance.now() - start;
                    redisCommandCounter.add(1, { command: cmd, status: 'failure' });
                    redisDurationHistogram.record(duration, { command: cmd, status: 'failure' });
                    throw error;
                }
            };
        }
        return value;
    }
});

