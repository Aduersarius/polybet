/**
 * Performance Monitoring Utilities
 *
 * Tracks API performance, errors, and system metrics
 */

import { redis } from './redis';

interface PerformanceLog {
    endpoint: string;
    method: string;
    duration: number;
    success: boolean;
    statusCode?: number;
    userAgent?: string;
    ip?: string;
    timestamp: number;
}

export class PerformanceMonitor {
    private static readonly LOG_KEY = 'performance_logs';
    private static readonly MAX_LOGS = 1000;
    private static readonly STATS_KEY = 'performance_stats';

    /**
     * Log API request performance
     */
    static async logRequest(
        endpoint: string,
        method: string,
        duration: number,
        success: boolean,
        statusCode?: number,
        userAgent?: string,
        ip?: string
    ): Promise<void> {
        const log: PerformanceLog = {
            endpoint,
            method,
            duration,
            success,
            statusCode,
            userAgent,
            ip,
            timestamp: Date.now()
        };

        // Console logging for immediate visibility
        const status = success ? '✅' : '❌';
        console.log(`[${new Date().toISOString()}] ${method} ${endpoint}: ${duration}ms ${status}`);

        // Store in Redis for analysis
        if (redis) {
            try {
                await redis.lpush(this.LOG_KEY, JSON.stringify(log));
                await redis.ltrim(this.LOG_KEY, 0, this.MAX_LOGS - 1);

                // Update rolling statistics
                await this.updateStats(log);
            } catch (error) {
                console.error('Failed to store performance log:', error);
            }
        }
    }

    /**
     * Update rolling performance statistics
     */
    private static async updateStats(log: PerformanceLog): Promise<void> {
        if (!redis) return;

        const key = `${this.STATS_KEY}:${log.endpoint}`;
        const now = Date.now();
        const windowStart = now - (5 * 60 * 1000); // 5 minute window

        try {
            // Add to sorted set with timestamp as score
            await redis.zadd(key, now, JSON.stringify(log));

            // Remove old entries outside the window
            await redis.zremrangebyscore(key, 0, windowStart);

            // Set expiration for the key
            await redis.expire(key, 3600); // 1 hour
        } catch (error) {
            console.error('Failed to update performance stats:', error);
        }
    }

    /**
     * Get performance statistics for an endpoint
     */
    static async getEndpointStats(endpoint: string, windowMinutes: number = 5) {
        if (!redis) return null;

        const key = `${this.STATS_KEY}:${endpoint}`;
        const now = Date.now();
        const windowStart = now - (windowMinutes * 60 * 1000);

        try {
            const logs = await redis.zrangebyscore(key, windowStart, now);

            if (logs.length === 0) return null;

            const parsedLogs: PerformanceLog[] = logs.map(log => JSON.parse(log));

            const totalRequests = parsedLogs.length;
            const successfulRequests = parsedLogs.filter(log => log.success).length;
            const successRate = (successfulRequests / totalRequests) * 100;

            const durations = parsedLogs.map(log => log.duration).sort((a, b) => a - b);
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const p50Duration = durations[Math.floor(durations.length * 0.5)];
            const p95Duration = durations[Math.floor(durations.length * 0.95)];
            const p99Duration = durations[Math.floor(durations.length * 0.99)];

            return {
                endpoint,
                windowMinutes,
                totalRequests,
                successfulRequests,
                successRate: Math.round(successRate * 100) / 100,
                avgDuration: Math.round(avgDuration),
                p50Duration,
                p95Duration,
                p99Duration,
                minDuration: Math.min(...durations),
                maxDuration: Math.max(...durations)
            };
        } catch (error) {
            console.error('Failed to get endpoint stats:', error);
            return null;
        }
    }

    /**
     * Get overall system performance summary
     */
    static async getSystemSummary() {
        if (!redis) return null;

        try {
            const logs = await redis.lrange(this.LOG_KEY, 0, 100);

            if (logs.length === 0) return null;

            const parsedLogs: PerformanceLog[] = logs.map(log => JSON.parse(log));

            const totalRequests = parsedLogs.length;
            const successfulRequests = parsedLogs.filter(log => log.success).length;
            const successRate = (successfulRequests / totalRequests) * 100;

            const errorRate = 100 - successRate;
            const avgDuration = parsedLogs.reduce((sum, log) => sum + log.duration, 0) / totalRequests;

            // Group by endpoint
            const endpointStats = parsedLogs.reduce((acc, log) => {
                if (!acc[log.endpoint]) {
                    acc[log.endpoint] = { count: 0, totalDuration: 0, errors: 0 };
                }
                acc[log.endpoint].count++;
                acc[log.endpoint].totalDuration += log.duration;
                if (!log.success) acc[log.endpoint].errors++;
                return acc;
            }, {} as Record<string, { count: number; totalDuration: number; errors: number }>);

            const topEndpoints = Object.entries(endpointStats)
                .map(([endpoint, stats]) => ({
                    endpoint,
                    requests: stats.count,
                    avgDuration: Math.round(stats.totalDuration / stats.count),
                    errorRate: Math.round((stats.errors / stats.count) * 100)
                }))
                .sort((a, b) => b.requests - a.requests)
                .slice(0, 5);

            return {
                totalRequests,
                successRate: Math.round(successRate * 100) / 100,
                errorRate: Math.round(errorRate * 100) / 100,
                avgDuration: Math.round(avgDuration),
                topEndpoints
            };
        } catch (error) {
            console.error('Failed to get system summary:', error);
            return null;
        }
    }

    /**
     * Middleware function for Next.js API routes
     */
    static createMiddleware() {
        return async (request: Request, response?: Response, next?: () => Promise<any>) => {
            const startTime = Date.now();
            const url = new URL(request.url);
            const endpoint = url.pathname;
            const method = request.method;

            try {
                let result;
                if (next) {
                    result = await next();
                }

                const duration = Date.now() - startTime;

                // Extract additional info
                const userAgent = request.headers.get('user-agent') || undefined;
                const forwarded = request.headers.get('x-forwarded-for');
                const ip = forwarded?.split(',')[0] || undefined;

                await this.logRequest(
                    endpoint,
                    method,
                    duration,
                    true, // Assume success if no error thrown
                    (response as any)?.status,
                    userAgent,
                    ip
                );

                return result;
            } catch (error) {
                const duration = Date.now() - startTime;

                await this.logRequest(
                    endpoint,
                    method,
                    duration,
                    false,
                    500,
                    request.headers.get('user-agent') || undefined,
                    request.headers.get('x-forwarded-for')?.split(',')[0] || undefined
                );

                throw error;
            }
        };
    }
}