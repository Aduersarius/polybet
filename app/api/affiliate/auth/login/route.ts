import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateAffiliateToken } from '@/lib/affiliate-auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = loginSchema.parse(body);

    // Find affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { email: validated.email }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check password
    const passwordValid = await bcrypt.compare(validated.password, affiliate.password);

    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if affiliate is active
    if (!affiliate.isActive) {
      return NextResponse.json(
        { error: 'Account is inactive. Please contact support.' },
        { status: 403 }
      );
    }

    // Update last login
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate JWT token
    const token = generateAffiliateToken(affiliate.id, affiliate.email);

    return NextResponse.json({
      success: true,
      token,
      affiliate: {
        id: affiliate.id,
        email: affiliate.email,
        name: affiliate.name,
        referralCode: affiliate.referralCode,
        emailVerified: affiliate.emailVerified,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    console.error('[Affiliate Login] Error:', error);
    return NextResponse.json(
      { error: 'Failed to login' },
      { status: 500 }
    );
  }
}

