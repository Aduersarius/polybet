import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getAffiliateCookie } from './affiliate-cookies';

// Re-export cookie functions for convenience
export { setAffiliateCookie, getAffiliateCookie, clearAffiliateCookie } from './affiliate-cookies';

/**
 * Affiliate Tracking Utilities (Database Operations)
 * 
 * Handles database operations for affiliate tracking.
 * These functions require Node.js runtime (not Edge compatible).
 * No commission calculation - only tracking counts and amounts.
 */

/**
 * Update referral stats when user makes a deposit
 */
export async function updateReferralStats(
  userId: string,
  data: {
    depositAmount: Prisma.Decimal | number,
    isFirstDeposit: boolean
  }
): Promise<void> {
  try {
    // Find referral record
    const referral = await prisma.referral.findUnique({
      where: { userId },
      include: { affiliate: true }
    });

    if (!referral || !referral.affiliate.isActive) {
      return;
    }

    const depositAmount = typeof data.depositAmount === 'number' 
      ? new Prisma.Decimal(data.depositAmount) 
      : data.depositAmount;

    // Update referral record
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        depositCount: { increment: 1 },
        totalDepositAmount: { increment: depositAmount },
        ...(data.isFirstDeposit && {
          firstDepositDate: new Date(),
        })
      }
    });

    // Update affiliate stats
    await prisma.affiliate.update({
      where: { id: referral.affiliateId },
      data: {
        totalDeposits: { increment: 1 },
        ...(data.isFirstDeposit && {
          activeReferrals: { increment: 1 }
        })
      }
    });
  } catch (error) {
    console.error('[Affiliate Tracking] Error updating referral stats:', error);
    // Don't throw - affiliate tracking shouldn't break deposit flow
  }
}

/**
 * Update referral trade stats (volume and revenue tracking for admin)
 */
export async function updateReferralTradeStats(
  userId: string,
  data: {
    volume: Prisma.Decimal | number,
    revenue: Prisma.Decimal | number // Platform profit (admin tracking only)
  }
): Promise<void> {
  try {
    const referral = await prisma.referral.findUnique({
      where: { userId },
      include: { affiliate: true }
    });

    if (!referral || !referral.affiliate.isActive) {
      return;
    }

    const volume = typeof data.volume === 'number' 
      ? new Prisma.Decimal(data.volume) 
      : data.volume;
    const revenue = typeof data.revenue === 'number' 
      ? new Prisma.Decimal(data.revenue) 
      : data.revenue;

    // Update referral record (track volume and revenue for admin)
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        totalVolume: { increment: volume },
        totalRevenue: { increment: revenue }
      }
    });

    // NO commission calculation - just tracking
  } catch (error) {
    console.error('[Affiliate Tracking] Error updating trade stats:', error);
    // Don't throw - affiliate tracking shouldn't break trade flow
  }
}

/**
 * Create referral record when user signs up
 */
export async function createReferralRecord(
  userId: string,
  affiliateId: string,
  data: {
    referralSource?: 'URL' | 'PROMO_CODE',
    promoCodeId?: string,
    utmSource?: string,
    utmMedium?: string,
    utmCampaign?: string,
    ipAddress?: string,
    userAgent?: string
  }
): Promise<void> {
  try {
    // Check if referral already exists
    const existing = await prisma.referral.findUnique({
      where: { userId }
    });

    if (existing) {
      return; // Already has referral record
    }

    // Create referral record
    await prisma.referral.create({
      data: {
        affiliateId,
        userId,
        promoCodeId: data.promoCodeId || null,
        referralSource: data.referralSource || null,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      }
    });

    // Update affiliate total referrals count
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        totalReferrals: { increment: 1 }
      }
    });

    // Update promo code usage if applicable
    if (data.promoCodeId) {
      await prisma.promoCode.update({
        where: { id: data.promoCodeId },
        data: {
          usageCount: { increment: 1 }
        }
      });
    }
  } catch (error) {
    console.error('[Affiliate Tracking] Error creating referral record:', error);
    // Don't throw - affiliate tracking shouldn't break signup flow
  }
}

/**
 * Validate promo code and return affiliate info
 */
export async function validatePromoCode(code: string): Promise<{
  valid: boolean;
  affiliateId?: string;
  affiliateName?: string;
  promoCodeId?: string;
}> {
  try {
    const promoCode = await prisma.promoCode.findUnique({
      where: { code },
      include: { affiliate: true }
    });

    if (!promoCode || !promoCode.isActive) {
      return { valid: false };
    }

    // Check if expired
    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      return { valid: false };
    }

    // Check if max uses reached
    if (promoCode.maxUses && promoCode.usageCount >= promoCode.maxUses) {
      return { valid: false };
    }

    // Check if affiliate is active
    if (!promoCode.affiliate.isActive) {
      return { valid: false };
    }

    return {
      valid: true,
      affiliateId: promoCode.affiliateId,
      affiliateName: promoCode.affiliate.name,
      promoCodeId: promoCode.id
    };
  } catch (error) {
    console.error('[Affiliate Tracking] Error validating promo code:', error);
    return { valid: false };
  }
}

/**
 * Validate referral code and return affiliate info
 */
export async function validateReferralCode(code: string): Promise<{
  valid: boolean;
  affiliateId?: string;
  affiliateName?: string;
}> {
  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { referralCode: code }
    });

    if (!affiliate || !affiliate.isActive) {
      return { valid: false };
    }

    return {
      valid: true,
      affiliateId: affiliate.id,
      affiliateName: affiliate.name
    };
  } catch (error) {
    console.error('[Affiliate Tracking] Error validating referral code:', error);
    return { valid: false };
  }
}

