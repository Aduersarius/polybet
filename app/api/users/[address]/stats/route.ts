import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const { address } = await params;

        const user = await prisma.user.findUnique({
            where: { address },
            include: {
                bets: true,
                transactions: true
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Calculate stats
        const totalVolume = user.bets.reduce((sum, bet) => sum + bet.amount, 0);

        const totalInvested = totalVolume;
        const totalPayouts = user.transactions
            .filter(t => t.type === 'BET_PAYOUT')
            .reduce((sum, t) => sum + t.amount, 0);

        const profit = totalPayouts - totalInvested;

        // Mock positions value for now as it requires complex AMM calc for all open bets
        // In a real app, we'd fetch current price for each bet's event
        const positionsValue = user.bets.length * 10; // Placeholder

        return NextResponse.json({
            username: user.username,
            avatarUrl: user.avatarUrl,
            joinedAt: user.createdAt,
            stats: {
                volume: totalVolume,
                profit: profit,
                positions: positionsValue,
                betCount: user.bets.length
            }
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user stats' },
            { status: 500 }
        );
    }
}
