import { redis } from './redis';

export async function checkRateLimit(userId: string, limit: number = 10, windowMs: number = 60000): Promise<boolean> {
    try {
        const key = `rate_limit:crypto:${userId}`;
        const count = await redis.incr(key);

        // Fail closed if Redis is unavailable
        if (count === null || typeof count === 'undefined') return false;

        if (count === 1) {
            await redis.expire(key, Math.ceil(windowMs / 1000));
        }

        return count <= limit;
    } catch (error) {
        console.error('Rate limit check failed, blocking by default:', error);
        return false; // Fail closed on error
    }
}