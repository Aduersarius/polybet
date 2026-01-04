import { redis } from './redis';

export type RateLimitResult = {
    allowed: boolean;
    reason?: 'LIMIT' | 'UNAVAILABLE';
    remaining?: number;
    resetInSeconds?: number;
};

const isProd = process.env.NODE_ENV === 'production';

/**
 * Generic Redis-based rate limiting helper
 */
async function checkLimit(
    key: string,
    limit: number,
    windowMs: number
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
            const count = await redis.incr(key);

            if (count === null || typeof count === 'undefined') {
                return { allowed: false, reason: 'UNAVAILABLE' };
            }

            if (count === 1) {
                await redis.expire(key, Math.ceil(windowMs / 1000));
            }

            const ttl = await redis.ttl(key);
            const remaining = Math.max(0, limit - count);

            return {
                allowed: count <= limit,
                reason: count <= limit ? undefined : 'LIMIT',
                remaining,
                resetInSeconds: ttl > 0 ? ttl : Math.ceil(windowMs / 1000)
            };
        }

        // Production fallback: fail closed
        if (isProd) {
            return { allowed: false, reason: 'UNAVAILABLE' };
        }

        // Development: allow if Redis unavailable (for local development)
        return { allowed: true, remaining: limit };
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
 * Rate limiting for authenticated user operations (general)
 * Default: 10 requests per minute
 */
export async function checkRateLimit(
    userId: string,
    ip?: string,
    limit: number = 10,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    const key = `rate_limit:crypto:${userId}:${ip || 'unknown'}`;
    return checkLimit(key, limit, windowMs);
}

/**
 * Rate limiting specifically for withdrawal requests
 * Stricter limits: 5 requests per hour
 */
export async function checkWithdrawalRateLimit(
    userId: string,
    ip?: string
): Promise<RateLimitResult> {
    // 5 withdrawal requests per hour per user
    const userKey = `rate_limit:withdrawal:user:${userId}`;
    const userResult = await checkLimit(userKey, 5, 3600000); // 1 hour

    if (!userResult.allowed) {
        return userResult;
    }

    // Also limit by IP to prevent abuse from same location
    if (ip && ip !== 'unknown') {
        const ipKey = `rate_limit:withdrawal:ip:${ip}`;
        const ipResult = await checkLimit(ipKey, 10, 3600000); // 10 per hour per IP
        if (!ipResult.allowed) {
            return ipResult;
        }
    }

    return userResult;
}

/**
 * Rate limiting for admin operations
 * Moderate limits: 30 requests per minute
 */
export async function checkAdminRateLimit(
    adminId: string,
    operation: string = 'general'
): Promise<RateLimitResult> {
    const key = `rate_limit:admin:${adminId}:${operation}`;
    return checkLimit(key, 30, 60000); // 30 per minute
}

/**
 * IP-based rate limiting for unauthenticated requests
 */
export async function checkRateLimitByIp(
    ip: string,
    limit: number = 20,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    const key = `rate_limit:ip:${ip}`;
    return checkLimit(key, limit, windowMs);
}