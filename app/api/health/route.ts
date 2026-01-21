import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const health: any = {
            status: 'ok',
            timestamp: Date.now(),
            services: {
                database: 'unknown',
                redis: 'unknown',
                polymarketWorker: 'unknown'
            }
        };

        // 1. Check Database
        try {
            await prisma.$queryRaw`SELECT 1`;
            health.services.database = 'connected';
        } catch (err) {
            health.services.database = 'disconnected';
            health.status = 'error';
        }

        // 2. Check Redis & Worker Heartbeat
        try {
            if (redis) {
                health.services.redis = 'connected';

                const heartbeat = await redis.get('worker:polymarket:heartbeat');
                if (heartbeat) {
                    const age = Date.now() - parseInt(heartbeat);
                    health.services.polymarketWorker = age < 60000 ? 'active' : 'stale';
                    if (age >= 60000) health.status = 'warning';
                    health.workerAgeMs = age;
                } else {
                    health.services.polymarketWorker = 'inactive';
                    health.status = 'warning';
                }
            } else {
                health.services.redis = 'disconnected';
                health.status = 'error';
            }
        } catch (err) {
            health.services.redis = 'error';
            health.status = 'error';
        }

        const statusCode = health.status === 'error' ? 500 : (health.status === 'warning' ? 200 : 200);
        return NextResponse.json(health, { status: statusCode });
    } catch (error) {
        return NextResponse.json({ status: 'error', message: 'Health check failed' }, { status: 500 });
    }
}
