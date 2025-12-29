import { NextRequest, NextResponse } from 'next/server';
import { requireAffiliateAuth } from '@/lib/affiliate-auth';

export async function GET(req: NextRequest) {
  try {
    const affiliate = await requireAffiliateAuth(req);

    // Get base referral link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const referralLink = `${baseUrl}/?ref=${affiliate.referralCode}`;

    return NextResponse.json({
      referralLink,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Links] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch links' },
      { status: 500 }
    );
  }
}


