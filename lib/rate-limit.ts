import { redis } from './redis';

const prod = process.env.NODE_ENV === 'production';

type RateLimitResult = {
    allowed: boolean;
    remaining?: number;
};

type MemoryEntry = {
    count: number;
    resetAt: number;
};

// Simple in-memory fallback so we don't fail open when Redis is unavailable.
const memoryBuckets = new Map<string, MemoryEntry>();

function rateLimitInMemory(key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = Date.now();
    const existing = memoryBuckets.get(key);

    if (!existing || existing.resetAt <= now) {
        memoryBuckets.set(key, {
            count: 1,
            resetAt: now + windowSeconds * 1000,
        });
        return { allowed: true, remaining: limit - 1 };
    }

    const nextCount = existing.count + 1;
    existing.count = nextCount;
    memoryBuckets.set(key, existing);

    return {
        allowed: nextCount <= limit,
        remaining: Math.max(limit - nextCount, 0),
    };
}

/**
 * Rate limiting with fail-closed behavior in production
 * In production: Always requires Redis, fails closed if unavailable
 * In development: Falls back to in-memory rate limiting if Redis unavailable
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
        // In production, Redis is required - fail closed if unavailable
        if (prod && (!redis || typeof (redis as any).incr !== 'function')) {
            console.error('[rate-limit] Redis unavailable in production - blocking request');
            return { allowed: false, remaining: 0 };
        }

        // Check if Redis connection is actually ready
        const status = (redis as any)?.status;
        if (prod && (!status || status !== 'ready')) {
            console.error('[rate-limit] Redis not ready in production - blocking request');
            return { allowed: false, remaining: 0 };
        }

        // If Redis is available, use it
        if (redis && status === 'ready') {
            const count = await (redis as any).incr(key);

            if (count === 1) {
                await (redis as any).expire(key, windowSeconds);
            }

            return {
                allowed: count <= limit,
                remaining: Math.max(limit - count, 0),
            };
        }

        // Fall back to in-memory only in development
        if (!prod) {
            return rateLimitInMemory(key, limit, windowSeconds);
        }

        // Production fallback: fail closed
        return { allowed: false, remaining: 0 };
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') || 
                                  error?.message?.includes('connect') ||
                                  error?.message?.includes('ECONNREFUSED');
        
        // In production, always fail closed on any error
        if (prod) {
            console.error('[rate-limit] Error in production - blocking request:', error);
            return { allowed: false, remaining: 0 };
        }
        
        // In development, fall back to in-memory for connection errors
        if (isConnectionError) {
            return rateLimitInMemory(key, limit, windowSeconds);
        }
        
        // Log unexpected errors in development
        console.error('[rate-limit] Unexpected error:', error);
        return rateLimitInMemory(key, limit, windowSeconds);
    }
}

/**
 * IP-based rate limiting for unauthenticated requests
 */
export async function rateLimitByIp(
    ip: string,
    limit: number,
    windowSeconds: number
): Promise<RateLimitResult> {
    const key = `rate_limit:ip:${ip}`;
    return rateLimit(key, limit, windowSeconds);
}
