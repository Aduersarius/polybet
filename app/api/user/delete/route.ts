import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, verifyUserTotp } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

// POST /api/user/delete - Soft delete user account
export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);
        const { totpCode } = await request.json().catch(() => ({}));

        // Require TOTP confirmation when 2FA is enabled
        if (user.twoFactorEnabled) {
            if (!totpCode || typeof totpCode !== 'string') {
                return NextResponse.json({ error: 'TOTP code required to delete account' }, { status: 401 });
            }
            const isValid = await verifyUserTotp(user.id, totpCode, request);
            if (!isValid) {
                return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 401 });
            }
        }

        // Soft delete by setting isDeleted flag
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isDeleted: true,
            }
        });

        // Delete all sessions for this user (logs them out)
        await prisma.session.deleteMany({
            where: { userId: user.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error('Error deleting account:', error);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
