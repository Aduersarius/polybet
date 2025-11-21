import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hardcoded admin addresses for initial security
const ADMIN_ADDRESSES = [
    '0x0000000000000000000000000000000000000000', // Seed admin
    '0x26295B14552b505e841B02957970C67Ae3B10877', // User admin
];

async function isAdmin(address: string) {
    const normalizedAddress = address.toLowerCase();
    const normalizedAdmins = ADMIN_ADDRESSES.map(a => a.toLowerCase());

    if (normalizedAdmins.includes(normalizedAddress)) return true;

    const user = await prisma.user.findUnique({
        where: { address: normalizedAddress }, // Assuming address is stored uniquely and case-insensitively or we trust input
        select: { isAdmin: true }
    });

    return !!user?.isAdmin;
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const adminAddress = searchParams.get('adminAddress');

        if (!adminAddress || !(await isAdmin(adminAddress))) {
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
        const body = await request.json();
        const { adminAddress, eventId, action, value } = body;

        if (!adminAddress || !(await isAdmin(adminAddress))) {
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
