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

        let user = await prisma.user.findUnique({
            where: { address },
            include: {
                transactions: true
            }
        });

        if (!user) {
            // Try by ID
            user = await prisma.user.findUnique({
                where: { id: address },
                include: {
                    transactions: true
                }
            });
        }

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Calculate stats
        const totalVolume = 0; // Placeholder - bets not included

        const totalInvested = totalVolume;
        const totalPayouts = user.transactions
            .filter(t => t.type === 'BET_PAYOUT')
            .reduce((sum, t) => sum + t.amount, 0);

        const profit = totalPayouts - totalInvested;

        // Mock positions value for now as it requires complex AMM calc for all open bets
        // In a real app, we'd fetch current price for each bet's event
        const positionsValue = 0; // Placeholder

        return NextResponse.json({
            username: user.username,
            avatarUrl: user.avatarUrl,
            joinedAt: user.createdAt,
            stats: {
                volume: totalVolume,
                profit: profit,
                positions: positionsValue,
                betCount: 0
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
