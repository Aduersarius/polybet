import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Admin authentication check
        await requireAdminAuth(request);

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = searchParams.get('search') || '';
        const sortField = searchParams.get('sortField') || 'createdAt';
        const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';

        const skip = (page - 1) * limit;

        // Build where clause for search
        const where: any = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { username: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } }
            ];
        }

        const orderBy: Record<string, any> = {};
        const sortableFields: Record<string, string> = {
            createdAt: 'createdAt',
            username: 'username',
            name: 'name',
            email: 'email',
            lastVisitedAt: 'lastVisitedAt',
            totalDeposited: 'totalDeposited',
            totalWithdrawn: 'totalWithdrawn',
        };
        const sortKey = sortableFields[sortField] || 'createdAt';
        orderBy[sortKey] = sortDir;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                include: {
                    _count: {
                        select: {
                            createdEvents: true,
                            marketActivity: true
                        }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);

        const userIds = users.map((u: { id: string }) => u.id);

        const betVolumeGroups = userIds.length
            ? await prisma.marketActivity.groupBy({
                by: ['userId'],
                where: { userId: { in: userIds } },
                _sum: { amount: true, price: true },
            })
            : [];

        const betVolumeMap = betVolumeGroups.reduce((acc: Record<string, number>, g: { userId: string; _sum: { amount: any; price: any } }) => {
            const sumAmount = Number(g._sum.amount || 0);
            const avgPrice = Number(g._sum.price || 1);
            acc[g.userId] = sumAmount * (avgPrice || 1);
            return acc;
        }, {});

        const serializedUsers = users.map((user: (typeof users)[number]) => ({
            ...user,
            currentBalance: Number(user.currentBalance || 0),
            totalDeposited: Number(user.totalDeposited || 0),
            totalWithdrawn: Number(user.totalWithdrawn || 0),
            betVolume: betVolumeMap[user.id] || 0,
            winRate: null, // not enough data to compute accurately here
        }));

        return NextResponse.json({ users: serializedUsers, total });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        // Admin authentication check
        await requireAdminAuth(request);
        const body = await request.json();
        const { targetUserId, action } = body;

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

export async function DELETE(request: NextRequest) {
    try {
        // Admin authentication check
        await requireAdminAuth(request);
        const body = await request.json();
        const { targetUserId } = body;

        if (!targetUserId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Delete the user and all related data (cascading deletes should be handled by Prisma schema)
        await prisma.user.delete({
            where: { id: targetUserId }
        });

        return NextResponse.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
