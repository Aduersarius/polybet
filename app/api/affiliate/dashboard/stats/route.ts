import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAffiliateAuth, getAffiliateFromRequest } from '@/lib/affiliate-auth';
import { requireAdminAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // Check if this is an admin request (admins can view any affiliate's stats)
    const isAdmin = await requireAdminAuth(req).catch(() => null);
    const affiliateIdParam = req.nextUrl.searchParams.get('affiliateId');
    const timeframe = req.nextUrl.searchParams.get('timeframe') || 'all'; // all, month, week, today
    const includeTimeSeries = req.nextUrl.searchParams.get('timeSeries') === 'true';
    
    let affiliate;
    let affiliateId: string;

    if (isAdmin && affiliateIdParam) {
      // Admin viewing specific affiliate
      affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateIdParam }
      });
      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }
      affiliateId = affiliateIdParam;
    } else {
      // Regular affiliate viewing their own stats
      affiliate = await requireAffiliateAuth(req);
      affiliateId = affiliate.id;
    }

    // Calculate date range based on timeframe
    const now = new Date();
    let startDate: Date | null = null;
    
    if (timeframe === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeframe === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (timeframe === 'month') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    }

    // Get all referrals for this affiliate
    const referrals = await prisma.referral.findMany({
      where: {
        affiliateId,
        ...(startDate && {
          signupDate: {
            gte: startDate
          }
        })
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          }
        }
      },
      orderBy: {
        signupDate: 'asc'
      }
    });

    // Calculate stats
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter((r: any) => r.firstDepositDate !== null).length;
    const totalDeposits = referrals.reduce((sum: number, r: any) => sum + (r.depositCount || 0), 0);
    const conversionRate = totalReferrals > 0 ? (activeReferrals / totalReferrals) * 100 : 0;

    // Admin-only stats
    let adminStats: {
      totalDepositAmount: number;
      totalRevenue: number;
      avgDepositPerUser: number;
      revenueByMonth: Array<{ month: string; revenue: number }>;
    } | null = null;

    if (isAdmin) {
      const totalDepositAmount = referrals.reduce((sum: number, r: any) => 
        sum + Number(r.totalDepositAmount || 0), 0
      );
      const totalRevenue = referrals.reduce((sum: number, r: any) => 
        sum + Number(r.totalRevenue || 0), 0
      );
      const avgDepositPerUser = activeReferrals > 0 
        ? totalDepositAmount / activeReferrals 
        : 0;

      // Calculate monthly revenue (last 12 months)
      const revenueByMonth: Record<string, number> = {};
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toISOString().slice(0, 7); // YYYY-MM
        revenueByMonth[monthKey] = 0;
      }

      // Group revenue by month (simplified - using signup month as proxy)
      referrals.forEach((ref: any) => {
        const monthKey = ref.signupDate.toISOString().slice(0, 7);
        if (revenueByMonth[monthKey] !== undefined) {
          revenueByMonth[monthKey] += Number(ref.totalRevenue || 0);
        }
      });

      adminStats = {
        totalDepositAmount,
        totalRevenue,
        avgDepositPerUser,
        revenueByMonth: Object.entries(revenueByMonth).map(([month, revenue]) => ({
          month,
          revenue
        }))
      };
    }

    // Calculate monthly stats (counts only)
    const monthlyStats: Record<string, { referrals: number; deposits: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toISOString().slice(0, 7);
      monthlyStats[monthKey] = { referrals: 0, deposits: 0 };
    }

    referrals.forEach((ref: any) => {
      const monthKey = ref.signupDate.toISOString().slice(0, 7);
      if (monthlyStats[monthKey]) {
        monthlyStats[monthKey].referrals += 1;
        monthlyStats[monthKey].deposits += (ref.depositCount || 0);
      }
    });

    // Calculate time-series data for graph
    let timeSeriesData: Array<{
      date: string;
      referrals: number;
      registrations: number;
      income: number;
      firstDeposits: number;
      amountDeposits: number;
    }> = [];

    if (includeTimeSeries) {
      // Group by day for the selected timeframe
      const daysData: Record<string, {
        referrals: number;
        registrations: number;
        income: number;
        firstDeposits: number;
        amountDeposits: number;
      }> = {};

      const daysToShow = timeframe === 'today' ? 1 : timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 365;
      const seriesStartDate = new Date(now);
      if (startDate) {
        seriesStartDate.setTime(startDate.getTime());
      }
      seriesStartDate.setDate(seriesStartDate.getDate() - daysToShow);

      // Initialize all days
      for (let i = 0; i <= daysToShow; i++) {
        const date = new Date(seriesStartDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        daysData[dateKey] = {
          referrals: 0,
          registrations: 0,
          income: 0,
          firstDeposits: 0,
          amountDeposits: 0,
        };
      }

      // Populate with actual data
      referrals.forEach((ref: any) => {
        const dateKey = ref.signupDate.toISOString().split('T')[0];
        if (daysData[dateKey]) {
          daysData[dateKey].referrals += 1;
          daysData[dateKey].registrations += 1;
          if (ref.firstDepositDate) {
            daysData[dateKey].firstDeposits += 1;
          }
          daysData[dateKey].amountDeposits += ref.depositCount || 0;
          if (isAdmin) {
            daysData[dateKey].income += Number(ref.totalRevenue || 0);
          }
        }
      });

      timeSeriesData = Object.entries(daysData).map(([date, data]) => ({
        date,
        ...data
      }));
    }

    const response: any = {
      totalReferrals,
      activeReferrals,
      totalDeposits,
      conversionRate: Math.round(conversionRate * 100) / 100,
      monthlyStats: Object.entries(monthlyStats).map(([month, stats]) => ({
        month,
        referrals: stats.referrals,
        deposits: stats.deposits
      })),
      affiliateName: affiliate.name,
      affiliateEmail: affiliate.email,
      affiliateCode: affiliate.referralCode,
      ...(includeTimeSeries && { timeSeriesData }),
    };

    // Add admin-only stats if admin
    if (adminStats) {
      response.totalDepositAmount = adminStats.totalDepositAmount;
      response.totalRevenue = adminStats.totalRevenue;
      response.avgDepositPerUser = adminStats.avgDepositPerUser;
      response.revenueByMonth = adminStats.revenueByMonth;
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

