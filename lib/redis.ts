import Redis from 'ioredis';

// Use the REDIS_URL from env, or default to localhost (for VPS)
// For Vercel, you MUST set REDIS_URL in .env to point to your VPS (e.g. redis://:password@188.137.178.118:6379)
const globalForRedis = global as unknown as { redis: Redis | null };

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log('🔴 Redis URL:', redisUrl);

// Create Redis instance with error handling
let redisInstance: Redis | null = null;

try {
    redisInstance = globalForRedis.redis || new Redis(redisUrl);

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

    if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redisInstance;
} catch (error) {
    console.error('🔴 Failed to create Redis instance:', error);
    redisInstance = null;
}

// Export Redis instance (can be null if connection fails)
export const redis = redisInstance;
