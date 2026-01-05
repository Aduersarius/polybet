import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { auth } from '@/lib/auth';

// GET /api/auth/check-2fa - Check if current authenticated user has 2FA enabled
export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session?.user?.id) {
            return NextResponse.json({ enabled: false, error: 'Not authenticated' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { twoFactorEnabled: true }
        });

        return NextResponse.json({ enabled: user?.twoFactorEnabled ?? false });
    } catch (error) {
        console.error('[check-2fa GET] Error:', error);
        return NextResponse.json({ enabled: false, error: 'Internal error' }, { status: 500 });
    }
}
// POST /api/auth/check-2fa - Check if user has 2FA enabled (before login)
export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'Email required' }, { status: 400 });
        }

        const clientId = email.toLowerCase();
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
        const key = `rl:check-2fa:${clientId}:${ip}`;
        const { allowed } = await rateLimit(key, 10, 300); // 10 attempts per 5 minutes
        if (!allowed) {
            return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, twoFactorEnabled: true }
        });

        if (!user) {
            // Don't reveal if user exists or not
            return NextResponse.json({ has2FA: false });
        }

        // Check if user has 2FA enabled - use the authoritative flag
        // The twoFactorEnabled flag is set by better-auth when 2FA is enabled/disabled
        const has2FA = !!user.twoFactorEnabled;

        // Also verify the TwoFactor record exists (defensive check)
        // If flag is true but record is missing, something is wrong
        if (has2FA) {
            const twoFactor = await prisma.twoFactor.findUnique({
                where: { userId: user.id }
            });
            // If flag says enabled but record doesn't exist, fix the drift
            if (!twoFactor) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { twoFactorEnabled: false },
                });
                return NextResponse.json({ has2FA: false });
            }
        }

        return NextResponse.json({ has2FA });
    } catch (error) {
        console.error('Error checking 2FA:', error);
        return NextResponse.json({ has2FA: false });
    }
}
