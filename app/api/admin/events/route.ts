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

        const events = await prisma.event.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                creator: {
                    select: { username: true, address: true }
                },
                _count: {
                    select: { bets: true }
                }
            }
        });

        return NextResponse.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const { userId } = await auth();
        const body = await request.json();
        const { eventId, action, value } = body;

        if (!userId || !(await isAdmin(userId))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!eventId || !['toggleHide', 'resolve'].includes(action)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        let updateData = {};
        if (action === 'toggleHide') {
            updateData = { isHidden: value };
        } else if (action === 'resolve') {
            updateData = {
                status: 'RESOLVED',
                result: value // 'YES', 'NO', etc.
            };
        }

        const updatedEvent = await prisma.event.update({
            where: { id: eventId },
            data: updateData
        });

        return NextResponse.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
