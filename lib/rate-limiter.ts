import { redis } from './redis';

export type RateLimitResult = {
    allowed: boolean;
    reason?: 'LIMIT' | 'UNAVAILABLE';
};

export async function checkRateLimit(
    userId: string,
    ip?: string,
    limit: number = 10,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    try {
        const key = `rate_limit:crypto:${userId}:${ip || 'unknown'}`;
        const count = await redis.incr(key);

        if (count === null || typeof count === 'undefined') {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        if (count === 1) {
            await redis.expire(key, Math.ceil(windowMs / 1000));
        }

        return {
            allowed: count <= limit,
            reason: count <= limit ? undefined : 'LIMIT'
        };
    } catch (error) {
        console.error('Rate limit check failed, blocking by default:', error);
        return { allowed: false, reason: 'UNAVAILABLE' };
    }
}