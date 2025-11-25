/**
 * Redis Caching Utility
 * 
 * Provides helper functions for caching with Redis
 */

import { redis } from './redis';

interface CacheOptions {
    ttl?: number; // Time to live in seconds
    prefix?: string; // Optional key prefix
}

/**
 * Get value from cache or execute function and cache result
 */
export async function getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    options: CacheOptions = {}
): Promise<T> {
    const { ttl = 60, prefix = '' } = options;
    const fullKey = prefix ? `${prefix}:${key}` : key;

    // If Redis is not available, just execute the function
    if (!redis) {
        console.warn('⚠️ Redis not available, skipping cache');
        return await fn();
    }

    try {
        // Try to get from cache
        const cached = await redis.get(fullKey);

        if (cached) {
            console.log(`✅ Cache HIT: ${fullKey}`);
            return JSON.parse(cached) as T;
        }

        console.log(`❌ Cache MISS: ${fullKey}`);

        // Cache miss - execute function
        const result = await fn();

        // Store in cache with optimized TTL
        if (ttl > 0) {
            // Increase TTL for search results to reduce database load
            const optimizedTtl = prefix === 'search' ? Math.max(ttl, 1800) : ttl; // 30 min minimum for search
            await redis.setex(fullKey, optimizedTtl, JSON.stringify(result));
            console.log(`💾 Cached: ${fullKey} (TTL: ${optimizedTtl}s)`);
        }

        return result;
    } catch (error) {
        console.error(`Redis cache error for ${fullKey}:`, error);
        // On error, fall back to executing the function
        return await fn();
    }
}

/**
 * Invalidate (delete) a specific cache key
 */
export async function invalidate(key: string, prefix: string = ''): Promise<void> {
    const fullKey = prefix ? `${prefix}:${key}` : key;

    if (!redis) return;

    try {
        await redis.del(fullKey);
        console.log(`🗑️ Invalidated cache: ${fullKey}`);
    } catch (error) {
        console.error(`Failed to invalidate cache ${fullKey}:`, error);
    }
}

/**
 * Invalidate all keys matching a pattern
 * Useful for invalidating related caches
 */
export async function invalidatePattern(pattern: string): Promise<void> {
    if (!redis) return;

    try {
        const keys = await redis.keys(pattern);

        if (keys.length > 0) {
            await redis.del(...keys);
            console.log(`🗑️ Invalidated ${keys.length} cache keys matching: ${pattern}`);
        }
    } catch (error) {
        console.error(`Failed to invalidate pattern ${pattern}:`, error);
    }
}

/**
 * Get cache statistics (hit rate, etc.)
 */
export async function getCacheStats(): Promise<{
    keys: number;
    memory: string;
    hits?: number;
    misses?: number;
}> {
    if (!redis) {
        return { keys: 0, memory: '0' };
    }

    try {
        const dbSize = await redis.dbsize();
        const info = await redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
        const memory = memoryMatch ? memoryMatch[1] : 'unknown';

        return {
            keys: dbSize,
            memory,
        };
    } catch (error) {
        console.error('Failed to get cache stats:', error);
        return { keys: 0, memory: '0' };
    }
}

/**
 * Cache warming for popular content
 */
export async function warmCache<T>(
    keys: string[],
    fetchFn: (key: string) => Promise<T>,
    options: CacheOptions = {}
): Promise<void> {
    if (!redis) return;

    console.log(`🔥 Warming cache for ${keys.length} keys...`);

    const promises = keys.map(async (key) => {
        try {
            const result = await fetchFn(key);
            await getOrSet(key, () => Promise.resolve(result), options);
        } catch (error) {
            console.error(`Failed to warm cache for ${key}:`, error);
        }
    });

    await Promise.allSettled(promises);
    console.log('✅ Cache warming completed');
}

/**
 * Get cache hit rate statistics
 */
export async function getCacheHitRate(windowMinutes: number = 60): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
} | null> {
    if (!redis) return null;

    try {
        const info = await redis.info('stats');
        const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0');
        const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0');

        const total = hits + misses;
        const hitRate = total > 0 ? (hits / total) * 100 : 0;

        return { hits, misses, hitRate: Math.round(hitRate * 100) / 100 };
    } catch (error) {
        console.error('Failed to get cache hit rate:', error);
        return null;
    }
}

/**
 * Clear all cache
 * USE WITH CAUTION - only for development/testing
 */
export async function clearAllCache(): Promise<void> {
    if (!redis) return;

    try {
        await redis.flushdb();
        console.log('🗑️ Cleared all cache');
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}
