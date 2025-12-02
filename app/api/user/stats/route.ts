import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const userId = user.id;

        // Get user's balance from Balance table
        const balanceRecord = await prisma.balance.findFirst({
            where: {
                userId,
                tokenSymbol: 'TUSD',
                eventId: null,
                outcomeId: null
            }
        });

        // Get betting statistics
        const [totalBets, activeBets, resolvedBets] = await Promise.all([
            (prisma as any).marketActivity.count({ where: { userId, type: { in: ['BET', 'TRADE'] } } }),
            (prisma as any).marketActivity.count({
                where: {
                    userId,
                    type: { in: ['BET', 'TRADE'] },
                    event: { status: 'ACTIVE' }
                }
            }),
            (prisma as any).marketActivity.findMany({
                where: {
                    userId,
                    type: { in: ['BET', 'TRADE'] },
                    event: { status: 'RESOLVED' }
                },
                include: {
                    event: {
                        select: {
                            result: true
                        }
                    }
                }
            })
        ]);

        // Calculate won bets by comparing option with event result
        const wonBets = resolvedBets.filter(bet => bet.option === bet.event.result).length;

        // Calculate P&L (simplified - would need more complex logic for actual trades)
        const allBets = await (prisma as any).marketActivity.findMany({
            where: { userId, type: { in: ['BET', 'TRADE'] } },
            include: { event: true }
        });

        let totalProfit = 0;
        let totalVolume = 0;

        allBets.forEach(bet => {
            totalVolume += bet.amount;
            if (bet.event.status === 'RESOLVED') {
                if (bet.option === bet.event.result) {
                    // Won bet - calculate payout (simplified)
                    totalProfit += bet.amount * 0.95; // Placeholder
                } else {
                    // Lost bet
                    totalProfit -= bet.amount;
                }
            }
        });

        const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;

        return NextResponse.json({
            balance: balanceRecord?.amount || 0,
            totalBets,
            activeBets,
            totalVolume,
            totalProfit,
            winRate
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
