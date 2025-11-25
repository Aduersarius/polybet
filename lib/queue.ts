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
            console.warn('⚠️ Redis unavailable for queuing, executing directly');
            return await fn();
        }

        const startTime = Date.now();

        try {
            // Check current processing count
            const processing = await redis.incr(processingKey);
            await redis.expire(processingKey, 60); // Auto-cleanup

            if (processing > this.MAX_CONCURRENT) {
                // Too many concurrent requests, queue or reject
                await redis.decr(processingKey);

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

        } finally {
            // Always decrement the counter
            await redis.decr(processingKey);
        }
    }

    /**
     * Get current queue statistics
     */
    static async getStats(key: string) {
        if (!redis) return { processing: 0 };

        const processingKey = `processing:${key}`;
        const processing = await redis.get(processingKey);

        return {
            processing: parseInt(processing || '0'),
            maxConcurrent: this.MAX_CONCURRENT
        };
    }
}