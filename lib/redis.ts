import Redis from 'ioredis';

// Use the REDIS_URL from env, or default to localhost (for VPS)
// For Vercel, you MUST set REDIS_URL in .env to point to your VPS (e.g. redis://:password@188.137.178.118:6379)
const globalForRedis = global as unknown as { redis: Redis };

export const redis =
    globalForRedis.redis ||
    new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
