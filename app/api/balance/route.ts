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

        // Get user's TUSD balance (base currency)
        const balance = await prisma.balance.findFirst({
            where: {
                userId,
                tokenSymbol: 'TUSD',
                eventId: null,
                outcomeId: null
            }
        });

        return NextResponse.json({
            balance: balance?.amount || 0
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        return NextResponse.json({ balance: 0 });
    }
}
