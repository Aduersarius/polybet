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

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
        const rateLimit = await checkRateLimit(userId, ip);
        if (!rateLimit.allowed) {
            const status = rateLimit.reason === 'UNAVAILABLE' ? 503 : 429;
            const reason = rateLimit.reason === 'UNAVAILABLE'
                ? 'Rate limiting unavailable; please retry later'
                : 'Rate limit exceeded';
            return NextResponse.json({ canWithdraw: false, reason }, { status });
        }

        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorEnabled: true, emailVerified: true }
        });
        const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId },
            select: { secret: true }
        });

        // Check requirements
        const has2FA = !!(userRecord?.twoFactorEnabled && twoFactor?.secret);
        const emailVerified = !!userRecord?.emailVerified;

        // Check if user has made any bets or trades
        const betCount = await prisma.marketActivity.count({
            where: {
                userId,
                type: { in: ['BET', 'TRADE'] }
            }
        });
        const hasPlacedBet = betCount > 0;

        // Get user balance
        const balance = await prisma.balance.findFirst({
            where: {
                userId,
                tokenSymbol: 'TUSD',
                eventId: null,
                outcomeId: null
            }
        });
        const hasBalance = !!(balance && balance.amount.gt(0));
        const balanceAmount = balance ? Number(balance.amount) : 0;

        // Determine which requirement is missing
        let reason = '';
        if (!has2FA) {
            reason = 'Two-factor authentication is required to withdraw';
        } else if (!emailVerified) {
            reason = 'Email must be verified to withdraw';
        } else if (!hasPlacedBet) {
            reason = 'You must place at least one bet before requesting a withdrawal';
        } else if (!hasBalance) {
            reason = 'Insufficient balance';
        }

        // Return requirements status
        const requirements = {
            twoFactorEnabled: has2FA,
            emailVerified: emailVerified,
            hasPlacedBet: hasPlacedBet,
            hasBalance: hasBalance
        };

        if (reason) {
            return NextResponse.json({
                canWithdraw: false,
                reason,
                balance: balanceAmount,
                requirements
            });
        }

        const maxSingle = Number(process.env.WITHDRAW_MAX_SINGLE ?? 5000);
        const maxDaily = Number(process.env.WITHDRAW_MAX_DAILY ?? 20000);

        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const dailyTotals = await prisma.withdrawal.aggregate({
            where: {
                userId,
                status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] },
                createdAt: { gte: startOfDay }
            },
            _sum: { amount: true }
        });
        const usedToday = Number(dailyTotals._sum.amount || 0);

        if (!Number.isFinite(maxSingle) || maxSingle <= 0 || !Number.isFinite(maxDaily) || maxDaily <= 0) {
            return NextResponse.json({
                canWithdraw: false,
                reason: 'Withdrawal limits misconfigured on server'
            }, { status: 503 });
        }

        return NextResponse.json({
            canWithdraw: true,
            balance: balance.amount,
            limits: {
                single: maxSingle,
                daily: maxDaily,
                usedToday,
                remainingToday: Math.max(0, maxDaily - usedToday)
            },
            requirements: {
                twoFactorEnabled: true,
                emailVerified: true,
                hasPlacedBet: true,
                hasBalance: true
            }
        });
    } catch (error) {
        console.error('Error checking withdrawal eligibility:', error);
        return NextResponse.json({ canWithdraw: false, reason: 'Server error' });
    }
}
