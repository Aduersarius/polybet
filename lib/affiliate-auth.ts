import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || 'your-secret-key-change-in-production';

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

