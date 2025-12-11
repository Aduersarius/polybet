import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/user/2fa-status - Check if 2FA is enabled for user
export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);

        // Check if TwoFactor record exists for this user
        const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId: user.id }
        });

        // Use the authoritative flag set during successful verification
        let enabled = !!user.twoFactorEnabled;

        // If flag is true but the TwoFactor record was removed, fix the drift
        if (enabled && !twoFactor) {
            await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorEnabled: false },
            });
            enabled = false;
        }

        return NextResponse.json({
            enabled,
        });
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error('Error checking 2FA status:', error);
        return NextResponse.json({ enabled: false }, { status: 200 });
    }
}
