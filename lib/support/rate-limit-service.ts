/**
 * Rate Limit Service - Prevent abuse of support system
 */

import { redis } from '@/lib/redis';
import type { RateLimitResult } from './types';

// Rate limit configuration
const RATE_LIMITS = {
  ticket_create: {
    limit: 5,
    windowMinutes: 60,
  },
  message_send: {
    limit: 20,
    windowMinutes: 60,
  },
  attachment_upload: {
    limit: 10,
    windowMinutes: 60,
  },
} as const;

type RateLimitAction = keyof typeof RATE_LIMITS;

export class RateLimitService {
  /**
   * Check if action is allowed for user
   */
  async checkLimit(userId: string, action: RateLimitAction): Promise<RateLimitResult> {
    const config = RATE_LIMITS[action];
    const key = `support:ratelimit:${action}:${userId}`;
    const now = Date.now();
    const windowMs = config.windowMinutes * 60 * 1000;
    const windowStart = now - windowMs;

    try {
      // Use Redis sorted set to track requests with timestamps
      const pipe = redis.pipeline();
      
      // Remove old entries outside the window
      pipe.zremrangebyscore(key, 0, windowStart);
      
      // Count current entries
      pipe.zcard(key);
      
      // Set expiry
      pipe.expire(key, config.windowMinutes * 60);
      
      const results = await pipe.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      const allowed = count < config.limit;
      const remaining = Math.max(0, config.limit - count);
      
      // Calculate reset time (end of current window)
      const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldestEntry.length > 1 ? parseInt(oldestEntry[1]) : now;
      const resetAt = new Date(oldestTimestamp + windowMs);

      return {
        allowed,
        remaining,
        resetAt,
      };
    } catch (error) {
      // If Redis is unavailable, allow the request (fail open)
      // This ensures the system continues to work even if Redis is down
      console.warn('Redis unavailable for rate limiting, allowing request:', error);
      return {
        allowed: true,
        remaining: config.limit,
        resetAt: new Date(now + windowMs),
      };
    }
  }

  /**
   * Record an action (call after performing the action)
   */
  async recordAction(userId: string, action: RateLimitAction): Promise<void> {
    const key = `support:ratelimit:${action}:${userId}`;
    const now = Date.now();
    const config = RATE_LIMITS[action];

    try {
      await redis.zadd(key, now, `${now}-${Math.random()}`);
      await redis.expire(key, config.windowMinutes * 60);
    } catch (error) {
      // Silently fail if Redis is unavailable - rate limiting is not critical
      console.warn('Redis unavailable for recording rate limit action:', error);
    }
  }

  /**
   * Check and record in one operation (use this for atomic check-and-increment)
   */
  async checkAndRecord(userId: string, action: RateLimitAction): Promise<RateLimitResult> {
    const result = await this.checkLimit(userId, action);
    
    if (result.allowed) {
      await this.recordAction(userId, action);
      return {
        ...result,
        remaining: result.remaining - 1,
      };
    }
    
    return result;
  }

  /**
   * Reset rate limit for user (admin override)
   */
  async resetLimit(userId: string, action: RateLimitAction): Promise<void> {
    const key = `support:ratelimit:${action}:${userId}`;
    await redis.del(key);
  }

  /**
   * Reset all rate limits for user (admin override)
   */
  async resetAllLimits(userId: string): Promise<void> {
    const actions: RateLimitAction[] = ['ticket_create', 'message_send', 'attachment_upload'];
    await Promise.all(actions.map((action) => this.resetLimit(userId, action)));
  }

  /**
   * Get current usage for user (admin view)
   */
  async getUsage(userId: string): Promise<Record<RateLimitAction, { current: number; limit: number; resetAt: Date }>> {
    const actions: RateLimitAction[] = ['ticket_create', 'message_send', 'attachment_upload'];
    const results = await Promise.all(
      actions.map(async (action) => {
        const config = RATE_LIMITS[action];
        const key = `support:ratelimit:${action}:${userId}`;
        const now = Date.now();
        const windowMs = config.windowMinutes * 60 * 1000;
        const windowStart = now - windowMs;

        // Clean old entries and count
        await redis.zremrangebyscore(key, 0, windowStart);
        const count = await redis.zcard(key);

        // Get reset time
        const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTimestamp = oldestEntry.length > 1 ? parseInt(oldestEntry[1]) : now;
        const resetAt = new Date(oldestTimestamp + windowMs);

        return {
          action,
          current: count,
          limit: config.limit,
          resetAt,
        };
      })
    );

    return results.reduce(
      (acc, { action, current, limit, resetAt }) => {
        acc[action] = { current, limit, resetAt };
        return acc;
      },
      {} as Record<RateLimitAction, { current: number; limit: number; resetAt: Date }>
    );
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService();
