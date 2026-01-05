import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        const latestDeposit = await prisma.deposit.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ deposit: latestDeposit });
    } catch (error) {
        console.error('Error fetching latest deposit:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
