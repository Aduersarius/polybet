import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        console.log('Balance API - Session:', session?.user?.id ? 'authenticated' : 'not authenticated');

        if (!session?.user?.id) {
            console.log('Balance API - No session, returning empty balances');
            return NextResponse.json({ balance: 0, balances: [] });
        }

        const userId = session.user.id;
        console.log('Balance API - Fetching balances for user:', userId);

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

        console.log('Balance API - Found balances:', balances.length, balances.map(b => `${b.tokenSymbol}: ${b.amount}`));

        // Also include TUSD balance for backward compatibility
        const tusdBalance = balances.find(b => b.tokenSymbol === 'TUSD' && !b.eventId && !b.outcomeId);

        return NextResponse.json({
            balance: tusdBalance?.amount || 0,
            balances: balances
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        return NextResponse.json({ balance: 0, balances: [] });
    }
}
