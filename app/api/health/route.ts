import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    version: string;
    uptime: number;
    checks: {
        database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
        redis: { status: 'ok' | 'error' | 'unavailable'; latencyMs?: number; error?: string };
    };
}

const startTime = Date.now();

/**
 * Health Check Endpoint
 * 
 * Used by:
 * - Load balancers (Vercel, nginx, k8s)
 * - Uptime monitoring (UptimeRobot, Pingdom)
 * - Deployment verification
 * 
 * Returns:
 * - 200 if healthy
 * - 503 if unhealthy (database down)
 * - 207 if degraded (redis down but db ok)
 */
export async function GET() {
    const checks: HealthStatus['checks'] = {
        database: { status: 'ok' },
        redis: { status: 'unavailable' },
    };

    let overallStatus: HealthStatus['status'] = 'healthy';

    // Check Database
    const dbStart = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = {
            status: 'ok',
            latencyMs: Date.now() - dbStart,
        };
    } catch (error) {
        checks.database = {
            status: 'error',
            latencyMs: Date.now() - dbStart,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
        overallStatus = 'unhealthy';
    }

    // Check Redis
    if (redis) {
        const redisStart = Date.now();
        try {
            const status = (redis as any).status;
            if (status === 'ready') {
                await redis.ping();
                checks.redis = {
                    status: 'ok',
                    latencyMs: Date.now() - redisStart,
                };
            } else {
                checks.redis = {
                    status: 'error',
                    error: `Redis status: ${status}`,
                };
                if (overallStatus === 'healthy') {
                    overallStatus = 'degraded';
                }
            }
        } catch (error) {
            checks.redis = {
                status: 'error',
                latencyMs: Date.now() - redisStart,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
            if (overallStatus === 'healthy') {
                overallStatus = 'degraded';
            }
        }
    }

    const response: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks,
    };

    // Return appropriate status code
    const statusCode = overallStatus === 'unhealthy' ? 503 : overallStatus === 'degraded' ? 207 : 200;

    return NextResponse.json(response, { status: statusCode });
}
