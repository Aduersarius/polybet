import { NextRequest, NextResponse } from 'next/server';
import { validatePromoCode, validateReferralCode } from '@/lib/affiliate-tracking';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const type = searchParams.get('type') || 'referral'; // 'referral' or 'promo'

    if (!code) {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    if (type === 'promo') {
      const validation = await validatePromoCode(code);
      return NextResponse.json({
        valid: validation.valid,
        affiliateId: validation.affiliateId,
        affiliateName: validation.affiliateName,
        promoCodeId: validation.promoCodeId,
      });
    } else {
      const validation = await validateReferralCode(code);
      return NextResponse.json({
        valid: validation.valid,
        affiliateId: validation.affiliateId,
        affiliateName: validation.affiliateName,
      });
    }
  } catch (error) {
    console.error('[Affiliate Validate Code] Error:', error);
    return NextResponse.json(
      { error: 'Failed to validate code' },
      { status: 500 }
    );
  }
}

