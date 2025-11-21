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
    if (ADMIN_ADDRESSES.includes(address)) return true;

    const user = await prisma.user.findUnique({
        where: { address },
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
        const body = await request.json();
        const { adminAddress, targetUserId, action } = body;

        if (!adminAddress || !(await isAdmin(adminAddress))) {
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
