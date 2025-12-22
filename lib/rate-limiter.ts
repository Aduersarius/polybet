import { redis } from './redis';

export type RateLimitResult = {
    allowed: boolean;
    reason?: 'LIMIT' | 'UNAVAILABLE';
};

const isProd = process.env.NODE_ENV === 'production';

/**
 * Rate limiting for authenticated user operations
 * Always fails closed in production if Redis is unavailable
 */
export async function checkRateLimit(
    userId: string,
    ip?: string,
    limit: number = 10,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    try {
        // In production, Redis is required
        if (isProd && !redis) {
            console.error('[rate-limiter] Redis unavailable in production - blocking request');
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        // Check if Redis connection is actually ready
        const status = (redis as any)?.status;
        if (isProd && (!status || status !== 'ready')) {
            console.error('[rate-limiter] Redis not ready in production - blocking request');
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        // If Redis is available, use it
        if (redis && status === 'ready') {
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
        }

        // Production fallback: fail closed
        if (isProd) {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        // Development: allow if Redis unavailable (for local development)
        return { allowed: true };
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') || 
                                  error?.message?.includes('connect') ||
                                  error?.message?.includes('ECONNREFUSED');
        
        // In production, always fail closed
        if (isProd) {
            console.error('[rate-limiter] Error in production - blocking request:', error);
            return { allowed: false, reason: 'UNAVAILABLE' };
        }
        
        // In development, log but allow
        if (!isConnectionError) {
            console.error('[rate-limiter] Unexpected error:', error);
        }
        return { allowed: false, reason: 'UNAVAILABLE' };
    }
}

/**
 * IP-based rate limiting for unauthenticated requests
 */
export async function checkRateLimitByIp(
    ip: string,
    limit: number = 20,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    try {
        // In production, Redis is required
        if (isProd && !redis) {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        const status = (redis as any)?.status;
        if (isProd && (!status || status !== 'ready')) {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        if (redis && status === 'ready') {
            const key = `rate_limit:ip:${ip}`;
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
        }

        // Production: fail closed
        if (isProd) {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        // Development: allow
        return { allowed: true };
    } catch (error: any) {
        if (isProd) {
            console.error('[rate-limiter] IP rate limit error in production:', error);
            return { allowed: false, reason: 'UNAVAILABLE' };
        }
        return { allowed: false, reason: 'UNAVAILABLE' };
    }
}