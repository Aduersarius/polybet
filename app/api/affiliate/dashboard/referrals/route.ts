import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAffiliateAuth, getAffiliateFromRequest } from '@/lib/affiliate-auth';
import { requireAdminAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // Check if this is an admin request
    const isAdmin = await requireAdminAuth(req).catch(() => null);
    const affiliateIdParam = req.nextUrl.searchParams.get('affiliateId');
    
    let affiliate;
    let affiliateId: string;

    if (isAdmin && affiliateIdParam) {
      affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateIdParam }
      });
      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }
      affiliateId = affiliateIdParam;
    } else {
      affiliate = await requireAffiliateAuth(req);
      affiliateId = affiliate.id;
    }

    // Pagination
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Get referrals
    const [referrals, total] = await Promise.all([
      prisma.referral.findMany({
        where: { affiliateId },
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
        orderBy: { signupDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referral.count({
        where: { affiliateId }
      })
    ]);

    const response = {
      referrals: referrals.map((ref: any) => {
        const base = {
          userId: ref.userId,
          username: ref.user?.username || ref.user?.name || ref.user?.email || 'Unknown',
          signupDate: ref.signupDate,
          firstDepositDate: ref.firstDepositDate,
          depositCount: ref.depositCount,
          status: ref.firstDepositDate ? 'active' as const : 'inactive' as const,
        };

        // Add admin-only fields
        if (isAdmin) {
          return {
            ...base,
            totalDepositAmount: Number(ref.totalDepositAmount || 0),
            totalRevenue: Number(ref.totalRevenue || 0),
            totalVolume: Number(ref.totalVolume || 0),
          };
        }

        return base;
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Referrals] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}

