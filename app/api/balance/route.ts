import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const isDev = process.env.NODE_ENV !== 'production';
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ balance: 0, balances: [] });
        }

        const userId = session.user.id;

        // Get all user's balances (including outcome tokens)
        const balances = await prisma.balance.findMany({
            where: {
                userId,
                amount: { not: 0 } // Return all non-zero balances
            },
            select: {
                tokenSymbol: true,
                eventId: true,
                outcomeId: true,
                amount: true
            }
        });

        if (isDev) {
            console.log(
                'Balance API - Found balances:',
                balances.length,
                balances.map((b: (typeof balances)[number]) => `${b.tokenSymbol}: ${b.amount}`)
            );
        }

        // Also include TUSD balance for backward compatibility
        const tusdBalance = balances.find(
            (b: (typeof balances)[number]) => b.tokenSymbol === 'TUSD' && !b.eventId && !b.outcomeId
        );

        return NextResponse.json({
            balance: tusdBalance?.amount || 0,
            balances: balances
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        return NextResponse.json({ balance: 0, balances: [] });
    }
}
