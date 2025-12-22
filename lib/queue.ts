/**
 * Request Queuing System
 *
 * Prevents database connection exhaustion under high load
 * by limiting concurrent database operations
 */

import { redis } from './redis';

export class RequestQueue {
    private static readonly MAX_CONCURRENT = 50;
    private static readonly QUEUE_TIMEOUT = 30000; // 30 seconds

    /**
     * Execute a function with concurrency control
     */
    static async enqueue<T>(
        key: string,
        fn: () => Promise<T>,
        options: { timeout?: number } = {}
    ): Promise<T> {
        const queueKey = `queue:${key}`;
        const processingKey = `processing:${key}`;
        const timeout = options.timeout || this.QUEUE_TIMEOUT;

        if (!redis) {
            // Fallback to direct execution if Redis unavailable
            return await fn();
        }

        // Check if Redis connection is actually ready
        const status = (redis as any).status;
        if (!status || status !== 'ready') {
            // Fallback to direct execution if Redis not ready
            return await fn();
        }

        const startTime = Date.now();

        try {
            // Check current processing count
            // Wrap in try-catch because Redis might be a proxy without all methods
            let processing: number;
            try {
                processing = await redis.incr(processingKey);
                await redis.expire(processingKey, 60); // Auto-cleanup
            } catch (redisError: any) {
                const isConnectionError = redisError?.message?.includes('Connection is closed') || 
                                          redisError?.message?.includes('connect') ||
                                          redisError?.message?.includes('ECONNREFUSED');
                const isProd = process.env.NODE_ENV === 'production';
                
                if (!isConnectionError || isProd) {
                    console.warn('⚠️ Redis operation failed, falling back to direct execution:', redisError);
                }
                return await fn();
            }

            if (processing > this.MAX_CONCURRENT) {
                // Too many concurrent requests, queue or reject
                try {
                    await redis.decr(processingKey);
                } catch (e) {
                    // Ignore decrement error
                }

                if (Date.now() - startTime > timeout) {
                    throw new Error('Request timeout while waiting in queue');
                }

                // For now, reject with 503 Service Unavailable
                // In future, could implement actual queuing with Redis lists
                const error = new Error('Service temporarily unavailable - too many requests');
                (error as any).statusCode = 503;
                throw error;
            }

            // Execute the function
            const result = await Promise.race([
                fn(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Database operation timeout')), timeout)
                )
            ]);

            return result;

        } catch (error) {
            // If it's a queue/timeout error, rethrow it
            if ((error as any).statusCode === 503 || (error as Error).message.includes('timeout')) {
                throw error;
            }
            // For other errors (like Redis failures), log and execute anyway
            console.warn('⚠️ Queue error, executing directly:', error);
            return await fn();
        } finally {
            // Always try to decrement the counter
            try {
                if (redis) {
                    await redis.decr(processingKey);
                }
            } catch (e) {
                // Ignore errors in cleanup
            }
        }
    }

    /**
     * Get current queue statistics
     */
    static async getStats(key: string) {
        if (!redis) return { processing: 0 };

        const status = (redis as any).status;
        if (!status || status !== 'ready') {
            return { processing: 0, maxConcurrent: this.MAX_CONCURRENT };
        }

        try {
            const processingKey = `processing:${key}`;
            const processing = await redis.get(processingKey);

            return {
                processing: parseInt(processing || '0'),
                maxConcurrent: this.MAX_CONCURRENT
            };
        } catch (error: any) {
            const isConnectionError = error?.message?.includes('Connection is closed') || 
                                      error?.message?.includes('connect') ||
                                      error?.message?.includes('ECONNREFUSED');
            const isProd = process.env.NODE_ENV === 'production';
            
            if (!isConnectionError || isProd) {
                console.warn('⚠️ Failed to get queue stats:', error);
            }
            return { processing: 0, maxConcurrent: this.MAX_CONCURRENT };
        }
    }
}