import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  companyName: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
});

/**
 * Generate unique referral code
 */
function generateReferralCode(name: string): string {
  // Take first 4-6 characters of name, uppercase, add random numbers
  const namePart = name.replace(/[^a-zA-Z]/g, '').substring(0, 6).toUpperCase();
  const randomPart = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  return `${namePart}${randomPart}`;
}

/**
 * Check if referral code is unique
 */
async function isReferralCodeUnique(code: string): Promise<boolean> {
  const existing = await prisma.affiliate.findUnique({
    where: { referralCode: code }
  });
  return !existing;
}

/**
 * Generate unique referral code
 */
async function generateUniqueReferralCode(name: string): Promise<string> {
  let code = generateReferralCode(name);
  let attempts = 0;
  
  while (!(await isReferralCodeUnique(code)) && attempts < 10) {
    code = generateReferralCode(name + Math.random().toString());
    attempts++;
  }
  
  if (attempts >= 10) {
    // Fallback: use timestamp-based code
    code = `AFF${Date.now().toString().slice(-6)}`;
  }
  
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = signupSchema.parse(body);

    // Check if email already exists
    const existing = await prisma.affiliate.findUnique({
      where: { email: validated.email }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Generate unique referral code
    const referralCode = await generateUniqueReferralCode(validated.name);

    // Hash password
    const hashedPassword = await bcrypt.hash(validated.password, 10);

    // Create affiliate
    const affiliate = await prisma.affiliate.create({
      data: {
        email: validated.email,
        password: hashedPassword,
        name: validated.name,
        companyName: validated.companyName || null,
        website: validated.website || null,
        referralCode,
        emailVerified: false,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        referralCode: true,
        emailVerified: true,
        createdAt: true,
      }
    });

    // TODO: Send verification email
    // For now, we'll skip email verification requirement in this implementation

    return NextResponse.json({
      success: true,
      affiliate: {
        id: affiliate.id,
        email: affiliate.email,
        name: affiliate.name,
        referralCode: affiliate.referralCode,
        emailVerified: affiliate.emailVerified,
      },
      message: 'Affiliate account created successfully. Please check your email to verify your account.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    console.error('[Affiliate Signup] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create affiliate account' },
      { status: 500 }
    );
  }
}

