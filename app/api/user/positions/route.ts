import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const userId = user.id;

        // Get user's balance records for outcome tokens (their positions)
        const balances = await prisma.balance.findMany({
            where: {
                userId,
                eventId: { not: null },
                amount: { gt: 0 }
            },
            include: {
                user: false
            }
        });

        // Get event details for positions
        const positions = await Promise.all(
            balances.map(async (balance) => {
                const event = await prisma.event.findUnique({
                    where: { id: balance.eventId! },
                    select: {
                        title: true,
                        status: true,
                        outcomes: {
                            where: { id: balance.outcomeId! },
                            select: {
                                name: true,
                                probability: true
                            }
                        }
                    }
                }) as any;

                if (!event) return null;

                // Get user's bets for this event/outcome to calculate avg price
                const bets = await (prisma as any).marketActivity.findMany({
                    where: {
                        userId,
                        eventId: balance.eventId!,
                        option: event.outcomes[0]?.name,
                        type: { in: ['BET', 'TRADE'] }
                    },
                    select: {
                        amount: true,
                        price: true
                    }
                });

                const totalCost = bets.reduce((sum, bet) => sum + bet.amount, 0);
                const totalShares = balance.amount;
                const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
                const currentPrice = event.outcomes[0]?.probability || 0.5;
                const currentValue = totalShares * currentPrice;
                const unrealizedPnL = currentValue - totalCost;

                return {
                    eventId: balance.eventId!,
                    eventTitle: event.title,
                    option: event.outcomes[0]?.name || 'Unknown',
                    shares: totalShares,
                    avgPrice,
                    currentPrice,
                    unrealizedPnL
                };
            })
        );

        // Filter out null positions and return
        const validPositions = positions.filter(p => p !== null);

        return NextResponse.json(validPositions);
    } catch (error) {
        console.error('Error fetching user positions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
