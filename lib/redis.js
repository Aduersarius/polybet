import Redis from 'ioredis';
import { redisCommandCounter, redisDurationHistogram } from './metrics';
// Use the REDIS_URL from env, or default to localhost (for VPS)
// For Vercel, you MUST set REDIS_URL in .env to point to your VPS (e.g. redis://:password@188.137.178.118:6379)
const globalForRedis = global;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
function validateRedisUrl(url) {
    try {
        // Check if URL has basic structure
        if (!url.startsWith('redis://') && !url.startsWith('rediss://')) {
            return { valid: false, error: 'REDIS_URL must start with redis:// or rediss://' };
        }
        // Check if password is provided in the URL
        // Format can be: redis://:password@host:port or redis://username:password@host:port
        // Also supports rediss:// (TLS) URLs
        const hasPassword = url.includes('@') && (url.match(/redis[s]?:\/\/:[^@]+@/) || // :password@ format (both redis:// and rediss://)
            url.match(/redis[s]?:\/\/[^:]+:[^@]+@/) // username:password@ format (both redis:// and rediss://)
        );
        // For production, require password
        if (process.env.NODE_ENV === 'production' && !hasPassword) {
            return { valid: false, error: 'REDIS_URL must include password in production. Format: redis://:password@host:port or redis://username:password@host:port' };
        }
        // Try to parse the URL to validate format
        try {
            new URL(url);
        }
        catch {
            return { valid: false, error: 'Invalid REDIS_URL format. Expected: redis://:password@host:port' };
        }
        return { valid: true };
    }
    catch (err) {
        return { valid: false, error: `Invalid REDIS_URL format: ${err instanceof Error ? err.message : String(err)}` };
    }
}
function buildTlsConfig(url) {
    if (!url.startsWith('rediss://'))
        return undefined;
    const allowSelfSigned = process.env.REDIS_ALLOW_SELF_SIGNED === 'true' || process.env.REDIS_TLS_REJECT_UNAUTHORIZED === '0';
    const caB64 = process.env.REDIS_TLS_CA_BASE64;
    const tls = {};
    if (allowSelfSigned) {
        tls.rejectUnauthorized = false;
    }
    if (caB64) {
        try {
            tls.ca = Buffer.from(caB64, 'base64');
        }
        catch (err) {
            console.warn('⚠️ Failed to parse REDIS_TLS_CA_BASE64, ignoring', err);
        }
    }
    return Object.keys(tls).length ? tls : undefined;
}
function ensureSecureRedisConfig() {
    if (process.env.NODE_ENV !== 'production')
        return;
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
    return async (...args) => {
        const callback = args.find((arg) => typeof arg === 'function');
        if (callback) {
            try {
                callback(null, 0);
            }
            catch {
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
    };
    return pipeline;
}
// Lazy initialization - only connect when actually used (not during build)
let redisInstance = null;
let connectionAttempted = false;
function getRedisInstance() {
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
        // Validate REDIS_URL format
        const validation = validateRedisUrl(redisUrl);
        if (!validation.valid) {
            console.error('🔴 Redis Configuration Error:', validation.error);
            console.error('   Current REDIS_URL:', redisUrl.replace(/:[^:@]+@/, ':****@')); // Mask password
            return null;
        }
        // Silent initialization - errors logged only on failure
        const tls = buildTlsConfig(redisUrl);
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
            tls,
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
            }
            else {
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
            }
            else {
                console.error('⚠️ Redis connection failed:', errorMsg);
            }
        });
        if (process.env.NODE_ENV !== 'production') {
            globalForRedis.redis = redisInstance;
        }
        return redisInstance;
    }
    catch (error) {
        console.error('🔴 Failed to create Redis instance:', error);
        return null;
    }
}
// Export getter function instead of direct instance
export const redis = new Proxy({}, {
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
        const value = instance[prop];
        if (typeof value === 'function') {
            const originalMethod = value.bind(instance);
            return async (...args) => {
                const start = performance.now();
                const cmd = String(prop);
                try {
                    const result = await originalMethod(...args);
                    const duration = performance.now() - start;
                    redisCommandCounter.add(1, { command: cmd, status: 'success' });
                    redisDurationHistogram.record(duration, { command: cmd, status: 'success' });
                    return result;
                }
                catch (error) {
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
