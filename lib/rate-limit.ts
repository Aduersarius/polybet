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

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
        if (!redis || typeof (redis as any).incr !== 'function') {
            // Fail closed in production to avoid abuse when Redis is unavailable; allow limited in-memory in non-prod.
            return prod ? { allowed: false, remaining: 0 } : rateLimitInMemory(key, limit, windowSeconds);
        }

        // Check if Redis connection is actually ready
        const status = (redis as any).status;
        if (!status || status !== 'ready') {
            // Connection not ready, fall back to in-memory
            return prod ? { allowed: false, remaining: 0 } : rateLimitInMemory(key, limit, windowSeconds);
        }

        const count = await (redis as any).incr(key);

        if (count === 1) {
            await (redis as any).expire(key, windowSeconds);
        }

        return {
            allowed: count <= limit,
            remaining: Math.max(limit - count, 0),
        };
    } catch (error: any) {
        // Don't log expected connection errors in development - we gracefully fall back to in-memory
        const isConnectionError = error?.message?.includes('Connection is closed') || 
                                  error?.message?.includes('connect') ||
                                  error?.message?.includes('ECONNREFUSED');
        
        if (isConnectionError && !prod) {
            // Silently fall back in development
            return rateLimitInMemory(key, limit, windowSeconds);
        }
        
        // Log unexpected errors or all errors in production
        if (!isConnectionError || prod) {
            console.error('[rate-limit] error', error);
        }
        
        return prod ? { allowed: false, remaining: 0 } : rateLimitInMemory(key, limit, windowSeconds);
    }
}
