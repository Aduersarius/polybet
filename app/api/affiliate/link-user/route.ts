import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAffiliateCookie } from '@/lib/affiliate-tracking';
import { createReferralRecord, validatePromoCode } from '@/lib/affiliate-tracking';
import { requireAuth } from '@/lib/auth';

/**
 * Link a newly signed up user to an affiliate
 * Called after user signup to create referral record
 */
export async function POST(req: NextRequest) {
  try {
    // User must be authenticated (just signed up)
    const user = await requireAuth(req);

    // Check if user already has a referral record
    const existing = await prisma.referral.findUnique({
      where: { userId: user.id }
    });

    if (existing) {
      return NextResponse.json({ 
        success: true, 
        message: 'User already has referral record' 
      });
    }

    // Get affiliate from cookie
    const cookieHeader = req.headers.get('cookie');
    const affiliateId = getAffiliateCookie(cookieHeader);

    // Also check for promo code in request body
    const body = await req.json().catch(() => ({}));
    const promoCode = body.promoCode as string | undefined;

    let finalAffiliateId: string | null = null;
    let promoCodeId: string | null = null;
    let referralSource: 'URL' | 'PROMO_CODE' | null = null;

    // Priority: Promo code > Cookie
    if (promoCode) {
      const validation = await validatePromoCode(promoCode);
      if (validation.valid && validation.affiliateId) {
        finalAffiliateId = validation.affiliateId;
        promoCodeId = validation.promoCodeId || null;
        referralSource = 'PROMO_CODE';
      }
    } else if (affiliateId) {
      finalAffiliateId = affiliateId;
      referralSource = 'URL';
    }

    if (!finalAffiliateId) {
      return NextResponse.json({ 
        success: false, 
        message: 'No affiliate referral found' 
      });
    }

    // Get UTM params from cookie if available
    const utmCookie = cookieHeader?.split(';')
      .find(c => c.trim().startsWith('affiliate_utm='));
    let utmParams: any = {};
    if (utmCookie) {
      try {
        const utmValue = decodeURIComponent(utmCookie.split('=')[1]);
        utmParams = JSON.parse(utmValue);
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Get request metadata
    const ipAddress = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Create referral record
    await createReferralRecord(user.id, finalAffiliateId, {
      referralSource: referralSource ?? undefined,
      promoCodeId: promoCodeId ?? undefined,
      utmSource: utmParams.utmSource ?? undefined,
      utmMedium: utmParams.utmMedium ?? undefined,
      utmCampaign: utmParams.utmCampaign ?? undefined,
      ipAddress,
      userAgent
    });

    // Update user record (only if columns exist - migration may not be run yet)
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          referredBy: finalAffiliateId,
          referralDate: new Date()
        }
      });
    } catch (updateError: any) {
      // If columns don't exist yet (migration not run), log but don't fail
      if (updateError?.code === 'P2022' || updateError?.message?.includes('does not exist')) {
        console.warn('[Affiliate Link] User referral fields not available yet (migration pending)');
      } else {
        throw updateError;
      }
    }

    return NextResponse.json({ 
      success: true,
      affiliateId: finalAffiliateId
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Affiliate Link User] Error:', error);
    // Don't fail signup if affiliate linking fails
    return NextResponse.json({ 
      success: false,
      error: 'Failed to link affiliate (non-blocking)' 
    });
  }
}

