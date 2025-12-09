import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

// POST /api/user/delete - Soft delete user account
export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request);

        // Soft delete by marking as banned and anonymizing data
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isBanned: true,
                email: `deleted_${user.id}@deleted.local`,
                name: 'Deleted User',
                username: `deleted_${user.id}`,
                image: null,
                avatarUrl: null,
                description: null,
                twitter: null,
                discord: null,
                telegram: null,
                website: null,
                settings: Prisma.DbNull,
            } as any
        });

        // Delete all sessions for this user
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
