/**
 * Redis Caching Utility
 * 
 * Provides helper functions for caching with Redis
 */

import { redis } from './redis';
import { gzipSync, gunzipSync } from 'node:zlib';

interface CacheOptions {
    ttl?: number; // Time to live in seconds
    prefix?: string; // Optional key prefix
    compress?: boolean; // Force compression even for small values
}

/**
 * Get value from cache or execute function and cache result
 */
export async function getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    options: CacheOptions = {}
): Promise<T> {
    const { ttl = 60, prefix = '', compress = false } = options;
    const fullKey = prefix ? `${prefix}:${key}` : key;

    // If Redis is not available, just execute the function
    if (!redis) {
        return await fn();
    }

    // Check if Redis connection is actually ready
    const status = (redis as any).status;
    if (!status || status !== 'ready') {
        // Connection not ready, skip cache
        return await fn();
    }

    try {
        // Try to get from cache as buffer to handle compressed data
        const cached = await (redis as any).getBuffer(fullKey);

        if (cached && cached.length > 0) {
            try {
                // Check for GZIP magic bytes (0x1f 0x8b)
                if (cached[0] === 0x1f && cached[1] === 0x8b) {
                    const decompressed = gunzipSync(cached).toString();
                    return JSON.parse(decompressed) as T;
                }
                return JSON.parse(cached.toString()) as T;
            } catch (err) {
                console.warn(`Failed to parse cached value for ${fullKey}, falling back to fetch`, err);
                // Fall through to miss logic
            }
        }

        // Cache miss - execute function
        const result = await fn();

        // Store in cache with optimized TTL
        if (ttl > 0 && result !== undefined) {
            // Increase TTL for search results to reduce database load
            const optimizedTtl = prefix === 'search' ? Math.max(ttl, 1800) : ttl;
            const json = JSON.stringify(result);

            // Auto-compress if > 2KB or explicitly requested
            if (compress || json.length > 2048) {
                try {
                    const compressed = gzipSync(Buffer.from(json));
                    await (redis as any).setex(fullKey, optimizedTtl, compressed);
                } catch (err) {
                    console.warn(`Failed to compress value for ${fullKey}:`, err);
                    await redis.setex(fullKey, optimizedTtl, json);
                }
            } else {
                await redis.setex(fullKey, optimizedTtl, json);
            }
        }

        return result;
    } catch (error: any) {
        // Don't log expected connection errors in development - we gracefully fall back
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');

        const isProd = process.env.NODE_ENV === 'production';

        if (isConnectionError && !isProd) {
            // Silently fall back in development
            return await fn();
        }

        // Log unexpected errors or all errors in production
        if (!isConnectionError || isProd) {
            console.error(`Redis cache error for ${fullKey}:`, error);
        }

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

    const status = (redis as any).status;
    if (!status || status !== 'ready') return;

    try {
        await redis.del(fullKey);
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';

        if (!isConnectionError || isProd) {
            console.error(`Failed to invalidate cache ${fullKey}:`, error);
        }
    }
}

/**
 * Invalidate all keys matching a pattern
 * Useful for invalidating related caches
 */
export async function invalidatePattern(pattern: string): Promise<void> {
    if (!redis) return;

    const status = (redis as any).status;
    if (!status || status !== 'ready') return;

    try {
        const keys = await redis.keys(pattern);

        if (keys.length > 0) {
            await Promise.all(keys.map(key => redis.del(key)));
        }
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';

        if (!isConnectionError || isProd) {
            console.error(`Failed to invalidate pattern ${pattern}:`, error);
        }
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

    const status = (redis as any).status;
    if (!status || status !== 'ready') {
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
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';

        if (!isConnectionError || isProd) {
            console.error('Failed to get cache stats:', error);
        }
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

    const status = (redis as any).status;
    if (!status || status !== 'ready') return;

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
}

/**
 * PHASE 2 OPTIMIZATION: Batch invalidate multiple keys using Redis pipeline
 * Reduces RTT from N separate calls to 1 batched call
 */
export async function batchInvalidate(keys: string[], prefix: string = ''): Promise<void> {
    if (!redis || keys.length === 0) return;

    const status = (redis as any).status;
    if (!status || status !== 'ready') return;

    try {
        const pipeline = redis.pipeline();

        for (const key of keys) {
            const fullKey = prefix ? `${prefix}:${key}` : key;
            pipeline.del(fullKey);
        }

        await pipeline.exec();
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';

        if (!isConnectionError || isProd) {
            console.error('Batch invalidation failed:', error);
        }
    }
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

    const status = (redis as any).status;
    if (!status || status !== 'ready') return null;

    try {
        const info = await redis.info('stats');
        const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0');
        const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0');

        const total = hits + misses;
        const hitRate = total > 0 ? (hits / total) * 100 : 0;

        return { hits, misses, hitRate: Math.round(hitRate * 100) / 100 };
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';

        if (!isConnectionError || isProd) {
            console.error('Failed to get cache hit rate:', error);
        }
        return null;
    }
}

/**
 * Clear all cache
 * USE WITH CAUTION - only for development/testing
 */
export async function clearAllCache(): Promise<void> {
    if (!redis) return;

    const status = (redis as any).status;
    if (!status || status !== 'ready') return;

    try {
        await redis.flushdb();
    } catch (error: any) {
        const isConnectionError = error?.message?.includes('Connection is closed') ||
            error?.message?.includes('connect') ||
            error?.message?.includes('ECONNREFUSED');
        const isProd = process.env.NODE_ENV === 'production';

        if (!isConnectionError || isProd) {
            console.error('Failed to clear cache:', error);
        }
    }
}
