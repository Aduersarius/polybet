import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

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

    // Send verification email if Resend is configured
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

    if (resend) {
      try {
        const jwtSecret = process.env.AFFILIATE_JWT_SECRET || process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET;

        if (!jwtSecret && process.env.NODE_ENV === 'production') {
          throw new Error('JWT secret not configured');
        }

        const verificationToken = jwt.sign(
          { affiliateId: affiliate.id, email: affiliate.email },
          jwtSecret || "dev-secret-key",
          { expiresIn: '7d' }
        );

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        const verificationUrl = `${baseUrl}/affiliate/verify-email?token=${verificationToken}`;

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Pariflow <noreply@pariflow.com>',
          to: affiliate.email,
          subject: 'Verify your affiliate account - Pariflow',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verify your affiliate account - Pariflow</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #1a1a1a, #0a0a0a); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px;">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <span style="font-size: 28px; font-weight: bold; color: #8b5cf6;">Pariflow</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <h2 style="margin: 0 0 16px; font-size: 24px; color: #ffffff; text-align: center;">
                            Verify your affiliate account
                          </h2>
                          <p style="margin: 0 0 32px; font-size: 16px; color: #9ca3af; text-align: center; line-height: 1.5;">
                            Thanks for joining our affiliate program! Click the button below to verify your email address.
                          </p>
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            <tr>
                              <td align="center">
                                <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                                  Verify Email Address
                                </a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin: 32px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                            Or copy and paste this link into your browser:<br/>
                            <a href="${verificationUrl}" style="color: #8b5cf6; word-break: break-all;">${verificationUrl}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        });
        console.log('[Affiliate Signup] Verification email sent to:', affiliate.email);
      } catch (emailError) {
        console.error('[Affiliate Signup] Failed to send verification email:', emailError);
        // Don't fail signup if email fails - just log the error
      }
    } else {
      console.log('[Affiliate Signup] Resend not configured - skipping email verification');
    }

    return NextResponse.json({
      success: true,
      affiliate: {
        id: affiliate.id,
        email: affiliate.email,
        name: affiliate.name,
        referralCode: affiliate.referralCode,
        emailVerified: affiliate.emailVerified,
      },
      message: resend
        ? 'Affiliate account created successfully. Please check your email to verify your account.'
        : 'Affiliate account created successfully. You can now login.'
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    // Check if it's a Prisma error about missing table
    if (error?.code === 'P2021' || error?.message?.includes('does not exist') || error?.message?.includes('relation') || error?.message?.includes('table')) {
      console.error('[Affiliate Signup] Database schema error:', error);
      return NextResponse.json(
        {
          error: 'Database migration required',
          message: 'The affiliate system requires a database migration. Please run: npx prisma migrate dev'
        },
        { status: 503 }
      );
    }

    // Check if it's a unique constraint violation
    if (error?.code === 'P2002') {
      const field = error?.meta?.target?.[0] || 'field';
      if (field === 'email') {
        return NextResponse.json(
          { error: 'Email already registered as an affiliate' },
          { status: 400 }
        );
      }
      if (field === 'referralCode') {
        // Retry with a different code
        console.warn('[Affiliate Signup] Referral code collision, this should be rare');
        return NextResponse.json(
          { error: 'Please try again' },
          { status: 500 }
        );
      }
    }

    console.error('[Affiliate Signup] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create affiliate account',
        message: error?.message || 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

