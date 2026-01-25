import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;

  // Allow skipping validation for build
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    console.warn('[affiliate-auth] ⚠️ Skipping secret validation for build');
    return 'mock-secret-for-build-process-only-do-not-use';
  }

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production for affiliate authentication');
    }
    console.warn('[affiliate-auth] ⚠️ No JWT secret found - using insecure default for development only');
    return 'dev-only-insecure-secret-do-not-use-in-production';
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return secret;
})();

export interface AffiliateTokenPayload {
  affiliateId: string;
  email: string;
  type: 'affiliate';
}

/**
 * Get affiliate from JWT token in request
 */
export async function getAffiliateFromRequest(request: NextRequest): Promise<{
  id: string;
  email: string;
  name: string;
  referralCode: string;
  isActive: boolean;
  emailVerified: boolean;
} | null> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') ||
      request.cookies.get('affiliate_token')?.value;

    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AffiliateTokenPayload;

    if (decoded.type !== 'affiliate') {
      return null;
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: decoded.affiliateId },
      select: {
        id: true,
        email: true,
        name: true,
        referralCode: true,
        isActive: true,
        emailVerified: true,
      }
    });

    if (!affiliate || !affiliate.isActive) {
      return null;
    }

    return affiliate;
  } catch (error) {
    return null;
  }
}

/**
 * Require affiliate authentication in API routes
 */
export async function requireAffiliateAuth(request: NextRequest) {
  const affiliate = await getAffiliateFromRequest(request);

  if (!affiliate) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return affiliate;
}

/**
 * Generate JWT token for affiliate
 */
export function generateAffiliateToken(affiliateId: string, email: string): string {
  return jwt.sign(
    {
      affiliateId,
      email,
      type: 'affiliate'
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

