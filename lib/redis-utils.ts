/**
 * Redis Utility Helpers
 * 
 * Safe wrappers for Redis operations with connection validation
 * and graceful degradation when Redis is unavailable.
 */

import { redis } from './redis';

/**
 * Safely publish a message to a Redis channel
 * Returns true if successful, false if Redis is unavailable
 * Never throws - safe to use in critical paths
 */
export async function safePublish(
    channel: string,
    message: string
): Promise<boolean> {
    try {
        // Check if redis is available and connected
        if (!redis) {
            console.warn(`[Redis] Cannot publish to ${channel}: Redis not initialized`);
            return false;
        }

        // Check connection status
        const status = (redis as any).status;
        if (status !== 'ready' && status !== 'connect') {
            console.warn(`[Redis] Cannot publish to ${channel}: connection status is ${status}`);
            return false;
        }

        await redis.publish(channel, message);
        return true;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Redis] Failed to publish to %s:', channel, errorMsg);
        return false;
    }
}

/**
 * Safely delete a key from Redis
 * Returns true if successful, false if Redis is unavailable
 */
export async function safeDelete(key: string): Promise<boolean> {
    try {
        if (!redis || (redis as any).status !== 'ready') {
            return false;
        }

        await redis.del(key);
        return true;
    } catch (error) {
        console.error('[Redis] Failed to delete key %s:', key, error);
        return false;
    }
}

/**
 * Safely delete multiple keys from Redis
 * Returns count of successfully deleted keys
 */
export async function safeDeleteMultiple(keys: string[]): Promise<number> {
    if (!redis || (redis as any).status !== 'ready') {
        return 0;
    }

    let successCount = 0;
    await Promise.all(
        keys.map(async (key) => {
            const deleted = await safeDelete(key);
            if (deleted) successCount++;
        })
    );

    return successCount;
}

/**
 * Check if Redis is available and ready
 */
export function isRedisReady(): boolean {
    if (!redis) return false;
    const status = (redis as any).status;
    return status === 'ready' || status === 'connect';
}

/**
 * Get Redis connection status for debugging
 */
export function getRedisStatus(): string {
    if (!redis) return 'not_initialized';
    return (redis as any).status || 'unknown';
}
