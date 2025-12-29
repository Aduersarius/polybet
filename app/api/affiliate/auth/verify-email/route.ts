import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Verification token is required' },
        { status: 400 }
      );
    }

    // Verify and decode the JWT token
    const secret = process.env.AFFILIATE_JWT_SECRET || process.env.JWT_SECRET || 'super-secret-affiliate-key';
    let decoded: { affiliateId: string; email: string };
    
    try {
      decoded = jwt.verify(token, secret) as { affiliateId: string; email: string };
    } catch (jwtError) {
      return NextResponse.json(
        { error: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    // Find the affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: decoded.affiliateId, email: decoded.email }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    if (affiliate.emailVerified) {
      // Already verified - redirect to login with success message
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${baseUrl}/affiliate/login?verified=true`);
    }

    // Update emailVerified to true
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { emailVerified: true }
    });

    // Redirect to login with success message
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/affiliate/login?verified=true`);
  } catch (error) {
    console.error('[Affiliate Verify Email] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    );
  }
}

