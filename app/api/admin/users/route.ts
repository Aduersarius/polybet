import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hardcoded admin user IDs for initial security
const ADMIN_USER_IDS = [
    'admin_user_id', // Replace with actual admin user IDs from Clerk
];

async function isAdmin(userId: string) {
    if (ADMIN_USER_IDS.includes(userId)) return true;

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { isAdmin: true }
    });

    return !!user?.isAdmin;
}

export async function GET(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId || !(await isAdmin(userId))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { bets: true, createdEvents: true }
                }
            }
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        const body = await request.json();
        const { targetUserId, action } = body;

        if (!userId || !(await isAdmin(userId))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!targetUserId || !['ban', 'unban'].includes(action)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            data: {
                isBanned: action === 'ban'
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
