import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ balance: 0, balances: [] });
        }

        const userId = session.user.id;

        // Get user's current account mode
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { accountMode: true }
        });

        const accountMode = user?.accountMode || 'LIVE';

        // Get all user's balances for current mode (including outcome tokens)
        const balances = await prisma.balance.findMany({
            where: {
                userId,
                accountType: accountMode,
                amount: { not: 0 } // Return all non-zero balances
            },
            select: {
                tokenSymbol: true,
                eventId: true,
                outcomeId: true,
                amount: true
            }
        });



        // Also include TUSD balance for backward compatibility
        const tusdBalance = balances.find(
            (b: (typeof balances)[number]) => b.tokenSymbol === 'TUSD' && !b.eventId && !b.outcomeId
        );

        return NextResponse.json({
            balance: tusdBalance?.amount || 0,
            balances: balances,
            accountMode // Include current mode in response
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        return NextResponse.json({ balance: 0, balances: [], accountMode: 'LIVE' });
    }
}
