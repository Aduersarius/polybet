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
        if (!redis) {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        // Check if Redis connection is actually ready
        const status = (redis as any).status;
        if (!status || status !== 'ready') {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

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
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') || 
                                  error?.message?.includes('connect') ||
                                  error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';
        
        if (!isConnectionError || isProd) {
            console.error('Rate limit check failed, blocking by default:', error);
        }
        return { allowed: false, reason: 'UNAVAILABLE' };
    }
}