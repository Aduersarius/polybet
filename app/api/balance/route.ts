import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ balance: 0 });
        }

        const userId = session.user.id;

        // Get all user's balances (including outcome tokens)
        const balances = await prisma.balance.findMany({
            where: {
                userId,
                amount: { gt: 0 } // Only return balances with positive amounts
            },
            select: {
                tokenSymbol: true,
                eventId: true,
                outcomeId: true,
                amount: true
            }
        });

        // Also include TUSD balance for backward compatibility
        const tusdBalance = balances.find(b => b.tokenSymbol === 'TUSD' && !b.eventId && !b.outcomeId);

        return NextResponse.json({
            balance: tusdBalance?.amount || 0,
            balances: balances
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        return NextResponse.json({ balance: 0 });
    }
}
