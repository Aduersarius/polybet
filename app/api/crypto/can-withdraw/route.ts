import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ canWithdraw: false, reason: 'Not authenticated' });
        }

        const userId = session.user.id;

        const rateLimitOk = await checkRateLimit(userId);
        if (!rateLimitOk) {
            return NextResponse.json({ canWithdraw: false, reason: 'Rate limit exceeded' });
        }

        // Check if user has made any bets or trades
        const betCount = await prisma.marketActivity.count({
            where: {
                userId,
                type: { in: ['BET', 'TRADE'] }
            }
        });

        if (betCount === 0) {
            return NextResponse.json({
                canWithdraw: false,
                reason: 'You must place at least one bet before requesting a withdrawal'
            });
        }

        // Get user balance
        const balance = await prisma.balance.findFirst({
            where: {
                userId,
                tokenSymbol: 'TUSD',
                eventId: null,
                outcomeId: null
            }
        });

        if (!balance || balance.amount.lte(0)) {
            return NextResponse.json({
                canWithdraw: false,
                reason: 'Insufficient balance',
                balance: 0
            });
        }

        return NextResponse.json({
            canWithdraw: true,
            balance: balance.amount
        });
    } catch (error) {
        console.error('Error checking withdrawal eligibility:', error);
        return NextResponse.json({ canWithdraw: false, reason: 'Server error' });
    }
}
