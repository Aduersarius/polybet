import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAffiliateAuth } from '@/lib/affiliate-auth';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export async function GET(req: NextRequest) {
  try {
    const affiliate = await requireAffiliateAuth(req);
    const searchParams = req.nextUrl.searchParams;
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const groupBy = searchParams.get('groupBy') || 'day'; // day, week, month
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const exportFormat = searchParams.get('export') === 'true';

    // Get all referrals
    const where: any = { affiliateId: affiliate.id };
    
    if (startDate && endDate) {
      where.signupDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const referrals = await prisma.referral.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          }
        }
      },
      orderBy: {
        signupDate: 'desc'
      }
    });

    // Group data based on groupBy parameter
    const groupedData: Record<string, {
      date: string;
      referrals: number;
      registrations: number;
      deposits: number;
      revenue: number;
      conversionRate: number;
    }> = {};

    referrals.forEach((ref: any) => {
      let key: string;
      const date = new Date(ref.signupDate);

      if (groupBy === 'week') {
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        key = format(weekStart, 'yyyy-MM-dd');
      } else if (groupBy === 'month') {
        key = format(date, 'yyyy-MM');
      } else {
        key = format(date, 'yyyy-MM-dd');
      }

      if (!groupedData[key]) {
        groupedData[key] = {
          date: key,
          referrals: 0,
          registrations: 0,
          deposits: 0,
          revenue: 0,
          conversionRate: 0,
        };
      }

      groupedData[key].referrals += 1;
      groupedData[key].registrations += 1;
      groupedData[key].deposits += ref.depositCount || 0;
      // Revenue is admin-only, so we'll show 0 for affiliates
      groupedData[key].revenue += 0;
    });

    // Calculate conversion rates
    Object.keys(groupedData).forEach((key) => {
      const group = groupedData[key];
      group.conversionRate = group.registrations > 0
        ? (group.deposits / group.registrations) * 100
        : 0;
    });

    // Convert to array and sort
    let statistics = Object.values(groupedData).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Pagination
    const total = statistics.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedStats = statistics.slice(startIndex, startIndex + limit);

    const response: any = {
      statistics: paginatedStats,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    // Add export data if requested
    if (exportFormat) {
      response.exportData = statistics.map((stat) => ({
        Date: stat.date,
        Referrals: stat.referrals,
        Registrations: stat.registrations,
        Deposits: stat.deposits,
        'Conversion Rate (%)': stat.conversionRate.toFixed(2),
      }));
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Statistics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

