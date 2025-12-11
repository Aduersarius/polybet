import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

// POST /api/user/delete - Soft delete user account
export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireAuth(request);

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
