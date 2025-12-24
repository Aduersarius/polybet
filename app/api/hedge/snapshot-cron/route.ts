/**
 * Hedge Snapshot Cron Endpoint
 * 
 * Takes automated risk snapshots and checks for stuck hedges.
 * Designed to be called by Vercel cron or external scheduler.
 * 
 * Schedule: Daily at 3am UTC
 * Vercel config: { "crons": [{ "path": "/api/hedge/snapshot-cron", "schedule": "0 3 * * *" }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { hedgeManager } from '@/lib/hedge-manager';

// Sentry Cron Monitor slug
const CRON_MONITOR_SLUG = 'hedge-snapshot-cron';

// Vercel cron handlers should export GET
export async function GET(request: NextRequest) {
    // Wrap entire handler with Sentry cron monitoring
    return Sentry.withMonitor(
        CRON_MONITOR_SLUG,
        async () => {
            try {
                // Optional: Verify cron secret for security
                const authHeader = request.headers.get('authorization');
                const cronSecret = process.env.CRON_SECRET;

                if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
                    // Allow localhost/dev access without auth
                    const host = request.headers.get('host') || '';
                    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
                        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                    }
                }

                await hedgeManager.loadConfig();

                // 1. Take a risk snapshot
                await hedgeManager.takeRiskSnapshot();
                console.log('[Snapshot Cron] Risk snapshot taken');

                // 2. Check for stuck hedges (pending for > 5 minutes)
                const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000);
                const stuckHedges = await prisma.hedgePosition.findMany({
                    where: {
                        status: 'pending',
                        createdAt: { lt: stuckThreshold },
                    },
                    select: {
                        id: true,
                        userOrderId: true,
                        polymarketMarketId: true,
                        createdAt: true,
                        amount: true,
                        retryCount: true,
                    },
                });

                // 3. Mark stuck hedges as failed after too long
                const failedIds: string[] = [];
                for (const hedge of stuckHedges) {
                    const ageMinutes = (Date.now() - hedge.createdAt.getTime()) / (60 * 1000);

                    // If stuck for > 30 minutes, mark as failed
                    if (ageMinutes > 30) {
                        await prisma.hedgePosition.update({
                            where: { id: hedge.id },
                            data: {
                                status: 'failed',
                                failureReason: `Stuck in pending state for ${Math.round(ageMinutes)} minutes`,
                            },
                        });
                        failedIds.push(hedge.id);
                        console.warn(`[Snapshot Cron] Marked hedge ${hedge.id} as failed (stuck ${Math.round(ageMinutes)}m)`);
                    }
                }

                // 4. Get current exposure for response
                const exposure = await hedgeManager.getRiskExposure();

                return NextResponse.json({
                    success: true,
                    timestamp: new Date().toISOString(),
                    snapshotTaken: true,
                    stuckHedges: stuckHedges.length,
                    markedAsFailed: failedIds.length,
                    exposure: {
                        totalUnhedged: exposure.totalUnhedged,
                        totalHedged: exposure.totalHedged,
                        openPositions: exposure.openPositions,
                        recentFailures: exposure.recentFailures,
                    },
                });
            } catch (error) {
                console.error('[Snapshot Cron] Error:', error);
                Sentry.captureException(error);
                return NextResponse.json(
                    { error: 'Snapshot cron failed', details: error instanceof Error ? error.message : 'Unknown error' },
                    { status: 500 }
                );
            }
        },
        {
            // Monitor configuration - matches vercel.json schedule (daily at 3am)
            schedule: {
                type: 'crontab',
                value: '0 3 * * *',
            },
            timezone: 'UTC',
            maxRuntime: 300, // 5 minutes max
            checkinMargin: 5,
        }
    );
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
    return GET(request);
}
