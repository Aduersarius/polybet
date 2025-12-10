import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        const url = new URL(req.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const skip = (page - 1) * limit;

        const total = await prisma.withdrawal.count({
            where: { userId }
        });

        const withdrawals = await prisma.withdrawal.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: skip
        });

        const totalPages = Math.ceil(total / limit);

        return NextResponse.json({ withdrawals, total, page, limit, totalPages });
    } catch (error) {
        console.error('Error fetching user withdrawals:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}