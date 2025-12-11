import { redis } from './redis';

type RateLimitResult = {
    allowed: boolean;
    remaining?: number;
};

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
        // If redis is unavailable, allow but log nothing (best-effort)
        if (!redis || typeof (redis as any).incr !== 'function') {
            return { allowed: true };
        }

        const count = await (redis as any).incr(key);

        if (count === 1) {
            await (redis as any).expire(key, windowSeconds);
        }

        return {
            allowed: count <= limit,
            remaining: Math.max(limit - count, 0),
        };
    } catch (error) {
        console.error('[rate-limit] error', error);
        // Fail open on limiter errors to avoid blocking legit users if redis hiccups
        return { allowed: true };
    }
}
