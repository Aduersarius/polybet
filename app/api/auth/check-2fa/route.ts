import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

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
            select: { id: true }
        });

        if (!user) {
            // Don't reveal if user exists or not
            return NextResponse.json({ has2FA: false });
        }

        // Check if user has 2FA enabled
        const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId: user.id }
        });

        return NextResponse.json({ has2FA: !!twoFactor });
    } catch (error) {
        console.error('Error checking 2FA:', error);
        return NextResponse.json({ has2FA: false });
    }
}
