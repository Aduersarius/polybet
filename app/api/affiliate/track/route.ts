import { NextRequest, NextResponse } from 'next/server';
import { setAffiliateCookie } from '@/lib/affiliate-tracking';
import { validateReferralCode } from '@/lib/affiliate-tracking';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { referralCode, utmParams, metadata } = body;

    if (!referralCode || typeof referralCode !== 'string') {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400 }
      );
    }

    // Validate referral code
    const validation = await validateReferralCode(referralCode);
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 400 }
      );
    }

    // Set cookie
    const cookie = setAffiliateCookie(validation.affiliateId!);

    const response = NextResponse.json({
      success: true,
      affiliateId: validation.affiliateId,
      affiliateName: validation.affiliateName
    });

    response.headers.set('Set-Cookie', cookie);

    // Store UTM params if provided
    if (utmParams && typeof utmParams === 'object') {
      const utmCookie = `affiliate_utm=${encodeURIComponent(JSON.stringify(utmParams))}; expires=${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()}; path=/; SameSite=Lax; Secure`;
      response.headers.append('Set-Cookie', utmCookie);
    }

    return response;
  } catch (error) {
    console.error('[Affiliate Track] Error:', error);
    return NextResponse.json(
      { error: 'Failed to track referral' },
      { status: 500 }
    );
  }
}

