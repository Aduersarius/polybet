/**
 * Hedge Risk Management Dashboard API
 * 
 * Provides real-time risk metrics and hedge performance data
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hedgeManager } from '@/lib/hedge-manager';
import { polymarketTrading } from '@/lib/polymarket-trading';
import { requireAdminAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication for sensitive risk data
    await requireAdminAuth(request);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '24h';


    // Calculate time range
    const now = new Date();
    const periodMs = period === '1h' ? 60 * 60 * 1000
      : period === '24h' ? 24 * 60 * 60 * 1000
        : period === '7d' ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

    const startDate = new Date(now.getTime() - periodMs);

    // 1. Fetch Hedge Records first (needed for metrics)
    const hedgeRecords = await prisma.hedgeRecord.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const successfulHedges = hedgeRecords.filter((h: any) => h.status === 'hedged');
    const failedHedges = hedgeRecords.filter((h: any) => h.status === 'failed');
    const pendingHedges = hedgeRecords.filter((h: any) => h.status === 'pending');

    // 2. Calculate Exposure manually (Fixing the issue)
    const unhedgedOrders = await prisma.order.findMany({
      where: {
        status: { in: ['open', 'partial'] },
        // If hedgeRecord is null, it's unhedged
        hedgeRecord: null,
      },
      select: {
        amount: true,
        price: true
      }
    });

    const totalUnhedged = unhedgedOrders.reduce(
      (sum, o) => sum + (Number(o.amount) * Number(o.price)),
      0
    );

    // Sum of all active hedged amounts (approximate from records)
    // Note: This sums ALL historical hedged amounts in the period, which isn't quite "current exposure"
    // Ideally we'd sum currently active positions, but HedgeRecord doesn't track "closed" state fully yet.
    // For now, let's use the sum of 'hedged' status in the period as a proxy for activity/volume.
    const totalHedgedVolume = successfulHedges.reduce((sum: number, h: any) => sum + (h.polymarketAmount || 0), 0);

    // For "Current Hedged Exposure", we should probably look at open positions in Admin tab logic
    // But for dashboard summary, let's stick to totalUnhedged as the key risk metric.

    const openPositionsCount = unhedgedOrders.length;
    const recentFailuresCount = failedHedges.length;

    const exposure = {
      totalUnhedged,
      totalHedged: totalHedgedVolume,
      openPositions: openPositionsCount,
      recentFailures: recentFailuresCount
    };

    // 3. Calculate statistics
    const totalProfit = successfulHedges.reduce((sum: number, h: any) => sum + (h.netProfit || 0), 0);
    const totalFees = successfulHedges.reduce((sum: number, h: any) => sum + (h.polymarketFees || 0), 0);
    // ourSpread calculation if available, else 0
    const totalSpreadCaptured = successfulHedges.reduce((sum: number, h: any) => sum + ((h as any).ourSpread || 0), 0);

    const avgHedgeTime = 0;

    const successRate = hedgeRecords.length > 0
      ? successfulHedges.length / hedgeRecords.length
      : 0;

    // 4. Get hedge performance over time
    const hedgeTimeline = await prisma.riskSnapshot.findMany({
      where: {
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    // 5. Get configuration
    const config = hedgeManager.getConfig();

    // 6. Get top markets by hedge volume
    const marketStats = await prisma.hedgeRecord.groupBy({
      by: ['polymarketMarketId'],
      where: {
        createdAt: { gte: startDate },
        status: 'hedged',
      },
      _count: true,
      _sum: {
        polymarketAmount: true,
        netProfit: true,
      },
    });

    const marketDetails = await Promise.all(
      marketStats.slice(0, 10).map(async (stat: any) => {
        // Skip null market IDs
        if (!stat.polymarketMarketId) return null;

        const mapping = await prisma.polymarketMarketMapping.findFirst({
          where: { polymarketId: stat.polymarketMarketId },
        });

        return {
          marketId: stat.polymarketMarketId,
          eventId: mapping?.internalEventId || 'unknown',
          hedgeCount: stat._count,
          totalVolume: stat._sum.polymarketAmount || 0,
          totalProfit: stat._sum.netProfit || 0,
        };
      })
    );

    // Filter out nulls
    const validMarketDetails = marketDetails.filter(m => m !== null);

    // 7. Get recent failures details
    const recentFailuresDetails = failedHedges.slice(0, 10).map((h: any) => ({
      id: h.id,
      orderId: h.userOrderId,
      marketId: h.polymarketMarketId,
      reason: h.error,
      createdAt: h.createdAt,
      amount: h.userAmount || 0,
      userPrice: h.userPrice || 0,
      hedgePrice: h.polymarketPrice || 0,
    }));

    // 8. System health checks
    const systemHealth = {
      hedgingEnabled: config.enabled,
      polymarketConnected: polymarketTrading.isEnabled(),
      unhedgedExposurePercent: config.maxUnhedgedExposure > 0
        ? (exposure.totalUnhedged / config.maxUnhedgedExposure) * 100
        : 0,
      recentFailureRate: hedgeRecords.length > 0
        ? failedHedges.length / hedgeRecords.length
        : 0,
    };

    return NextResponse.json({
      summary: {
        period,
        totalHedges: hedgeRecords.length,
        successfulHedges: successfulHedges.length,
        failedHedges: failedHedges.length,
        pendingHedges: pendingHedges.length,
        successRate: Math.round(successRate * 100),
        avgHedgeTimeMs: Math.round(avgHedgeTime),
        totalProfit,
        totalFees,
        totalSpreadCaptured,
        netProfitMargin: totalSpreadCaptured > 0
          ? ((totalProfit / totalSpreadCaptured) * 100).toFixed(2)
          : 0,
      },
      exposure: {
        totalUnhedged: exposure.totalUnhedged,
        totalHedged: exposure.totalHedged,
        openPositions: exposure.openPositions,
        recentFailures: exposure.recentFailures,
        netExposure: exposure.totalUnhedged - exposure.totalHedged,
      },
      config: {
        enabled: config.enabled,
        minSpreadBps: config.minSpreadBps,
        maxSlippageBps: config.maxSlippageBps,
        maxUnhedgedExposure: config.maxUnhedgedExposure,
        maxPositionSize: config.maxPositionSize,
      },
      marketStats: validMarketDetails,
      recentFailures: recentFailuresDetails,
      timeline: hedgeTimeline.map((snap: any) => ({
        timestamp: snap.timestamp,
        unhedged: snap.totalUnhedgedValue,
        hedged: snap.totalHedgedValue,
        netExposure: snap.netExposure,
        successRate: snap.hedgeSuccessRate,
        openPositions: snap.openPositionsCount,
      })),
      systemHealth,
    });
  } catch (error) {
    console.error('[Hedge Dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hedge dashboard data' },
      { status: 500 }
    );
  }
}

