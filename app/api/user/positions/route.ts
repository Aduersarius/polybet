import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const userId = user.id;

        // Get user's balance records for outcome tokens (their positions)
        const balanceSelect = {
            eventId: true,
            outcomeId: true,
            tokenSymbol: true,
            amount: true
        } as const;

        let balances: Prisma.BalanceGetPayload<{ select: typeof balanceSelect }>[];
        try {
            balances = await prisma.balance.findMany({
                where: {
                    userId,
                    eventId: { not: null },
                    amount: { gt: 0 }
                },
                select: balanceSelect
            });
        } catch (err: any) {
            // Gracefully handle schema drift (e.g., missing columns in the current DB)
            if (err?.code === 'P2022') {
                console.warn('positions: balance query skipped due to schema mismatch (P2022)');
                return NextResponse.json([]);
            }
            throw err;
        }

        // Get event details for positions
        const positions = await Promise.all(
            balances.map(async (balance) => {
                const event: Prisma.EventGetPayload<{ select: { title: true; status: true; type: true } }> | null = await prisma.event.findUnique({
                    where: { id: balance.eventId! },
                    select: {
                        title: true,
                        status: true,
                        type: true
                    }
                });

                if (!event) return null;

                // Determine outcome name
                let outcomeName = 'Unknown';
                let currentPrice = 0.5;

                if (balance.outcomeId) {
                    // Multiple outcome event - fetch outcome directly
                    const outcome = await prisma.outcome.findUnique({
                        where: { id: balance.outcomeId },
                        select: { name: true, probability: true }
                    });
                    if (outcome) {
                        outcomeName = outcome.name;
                        currentPrice = outcome.probability || 0.5;
                    }
                } else if (event.type === 'MULTIPLE' && balance.tokenSymbol) {
                    // Try to find outcome by tokenSymbol (which might be the outcomeId)
                    const outcome = await prisma.outcome.findUnique({
                        where: { id: balance.tokenSymbol },
                        select: { name: true, probability: true }
                    });
                    if (outcome) {
                        outcomeName = outcome.name;
                        currentPrice = outcome.probability || 0.5;
                    }
                } else {
                    // Binary event - use tokenSymbol
                    outcomeName = balance.tokenSymbol.startsWith('YES') ? 'YES' :
                        balance.tokenSymbol.startsWith('NO') ? 'NO' : 'Unknown';
                }

                // Get user's bets for this event/outcome to calculate avg price
                const bets = await (prisma as any).marketActivity.findMany({
                    where: {
                        userId,
                        eventId: balance.eventId!,
                        OR: [
                            { option: outcomeName },
                            { outcomeId: balance.outcomeId }
                        ],
                        type: { in: ['BET', 'TRADE'] }
                    },
                    select: {
                        amount: true,
                        price: true
                    }
                });

                const totalCost = bets.reduce((sum: number, bet: { amount: number }) => sum + bet.amount, 0);
                const totalShares = balance.amount.toNumber();
                const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
                const currentValue = totalShares * currentPrice;
                const unrealizedPnL = currentValue - totalCost;

                return {
                    eventId: balance.eventId!,
                    eventTitle: event.title,
                    option: outcomeName,
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
