/**
 * Hedge Risk Management Dashboard API
 * 
 * Provides real-time risk metrics and hedge performance data
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hedgeManager } from '@/lib/hedge-manager';
import { polymarketTrading } from '@/lib/polymarket-trading';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '24h';

    // Calculate time range
    const now = new Date();
    const periodMs = period === '1h' ? 60 * 60 * 1000
      : period === '24h' ? 24 * 60 * 60 * 1000
      : period === '7d' ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
    
    const startDate = new Date(now.getTime() - periodMs);

    // Get current exposure
    const exposure = await hedgeManager.getRiskExposure();

    // Get hedge positions summary
    const hedgePositions = await prisma.hedgePosition.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const successfulHedges = hedgePositions.filter((h: any) => h.status === 'hedged');
    const failedHedges = hedgePositions.filter((h: any) => h.status === 'failed');
    const pendingHedges = hedgePositions.filter((h: any) => h.status === 'pending');

    // Calculate statistics
    const totalProfit = successfulHedges.reduce((sum: number, h: any) => sum + h.netProfit, 0);
    const totalFees = successfulHedges.reduce((sum: number, h: any) => sum + h.polymarketFees + h.gasCost, 0);
    const totalSpreadCaptured = successfulHedges.reduce((sum: number, h: any) => sum + h.spreadCaptured, 0);
    
    const avgHedgeTime = successfulHedges.length > 0
      ? successfulHedges
          .filter((h: any) => h.hedgedAt)
          .reduce((sum: number, h: any) => sum + (h.hedgedAt!.getTime() - h.createdAt.getTime()), 0) / successfulHedges.length
      : 0;

    const successRate = hedgePositions.length > 0
      ? successfulHedges.length / hedgePositions.length
      : 0;

    // Get hedge performance over time
    const hedgeTimeline = await prisma.riskSnapshot.findMany({
      where: {
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Get configuration
    const config = hedgeManager.getConfig();

    // Get top markets by hedge volume
    const marketStats = await prisma.hedgePosition.groupBy({
      by: ['polymarketMarketId'],
      where: {
        createdAt: { gte: startDate },
        status: 'hedged',
      },
      _count: true,
      _sum: {
        amount: true,
        netProfit: true,
      },
    });

    const marketDetails = await Promise.all(
      marketStats.slice(0, 10).map(async (stat: any) => {
        const mapping = await prisma.polymarketMarketMapping.findFirst({
          where: { polymarketId: stat.polymarketMarketId },
        });
        
        return {
          marketId: stat.polymarketMarketId,
          eventId: mapping?.internalEventId || 'unknown',
          hedgeCount: stat._count,
          totalVolume: stat._sum.amount || 0,
          totalProfit: stat._sum.netProfit || 0,
        };
      })
    );

    // Get recent failures for debugging
    const recentFailures = failedHedges.slice(0, 10).map((h: any) => ({
      id: h.id,
      orderId: h.userOrderId,
      marketId: h.polymarketMarketId,
      reason: h.failureReason,
      createdAt: h.createdAt,
      amount: h.amount,
      userPrice: h.userPrice,
      hedgePrice: h.hedgePrice,
    }));

    // System health checks
    const systemHealth = {
      hedgingEnabled: config.enabled,
      polymarketConnected: polymarketTrading.isEnabled(),
      unhedgedExposurePercent: config.maxUnhedgedExposure > 0
        ? (exposure.totalUnhedged / config.maxUnhedgedExposure) * 100
        : 0,
      recentFailureRate: hedgePositions.length > 0
        ? failedHedges.length / hedgePositions.length
        : 0,
    };

    return NextResponse.json({
      summary: {
        period,
        totalHedges: hedgePositions.length,
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
      marketStats: marketDetails,
      recentFailures,
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

