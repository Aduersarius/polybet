import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const userId = user.id;

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');

        const bets = await (prisma as any).marketActivity.findMany({
            where: {
                userId,
                type: { in: ['BET', 'TRADE'] }
            },
            include: {
                event: {
                    select: {
                        title: true,
                        status: true,
                        result: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        const formattedBets = bets.map(bet => ({
            id: bet.id,
            eventTitle: bet.event.title,
            amount: bet.amount,
            option: bet.option,
            createdAt: bet.createdAt.toISOString(),
            status: bet.event.status === 'RESOLVED'
                ? (bet.option === bet.event.result ? 'WON' : 'LOST')
                : 'PENDING',
            payout: bet.event.status === 'RESOLVED' && bet.option === bet.event.result
                ? bet.amount * 1.95 // Simplified payout calculation
                : undefined
        }));

        return NextResponse.json(formattedBets);
    } catch (error) {
        console.error('Error fetching user bets:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
