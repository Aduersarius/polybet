import { redis } from './redis';

export async function checkRateLimit(userId: string, limit: number = 10, windowMs: number = 60000): Promise<boolean> {
    try {
        const key = `rate_limit:crypto:${userId}`;
        const count = await redis.incr(key);

        if (count === null) return true; // Redis not available, allow

        if (count === 1) {
            await redis.expire(key, Math.ceil(windowMs / 1000));
        }

        return count <= limit;
    } catch (error) {
        console.error('Rate limit check failed:', error);
        return true; // Allow on error
    }
}