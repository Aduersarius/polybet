import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    await requireAdminAuth(req);

    const affiliates = await prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        referrals: {
          select: {
            totalDepositAmount: true,
            totalRevenue: true,
            firstDepositDate: true,
          }
        }
      }
    });

    // Calculate stats for each affiliate
    const affiliatesWithStats = affiliates.map((aff: any) => {
      const totalDepositAmount = (aff.referrals || []).reduce(
        (sum: number, ref: any) => sum + Number(ref.totalDepositAmount || 0),
        0
      );
      const totalRevenue = (aff.referrals || []).reduce(
        (sum: number, ref: any) => sum + Number(ref.totalRevenue || 0),
        0
      );
      const activeReferrals = (aff.referrals || []).filter(
        (ref: any) => ref.firstDepositDate !== null
      ).length;
      const avgDepositPerUser =
        activeReferrals > 0 ? totalDepositAmount / activeReferrals : 0;

      return {
        id: aff.id,
        email: aff.email,
        name: aff.name,
        referralCode: aff.referralCode,
        totalReferrals: aff.totalReferrals,
        activeReferrals: aff.activeReferrals,
        totalDeposits: aff.totalDeposits,
        isActive: aff.isActive,
        emailVerified: aff.emailVerified,
        createdAt: aff.createdAt,
        totalDepositAmount,
        totalRevenue,
        avgDepositPerUser,
      };
    });

    return NextResponse.json({
      affiliates: affiliatesWithStats
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Admin Affiliates] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch affiliates' },
      { status: 500 }
    );
  }
}

