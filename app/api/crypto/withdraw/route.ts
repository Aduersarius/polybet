import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getCryptoService } from '@/lib/crypto-service';
import { auth, verifyUserTotp } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin } from '@/lib/csrf';
import { createErrorResponse, createClientErrorResponse } from '@/lib/error-handler';
import { trackTransaction, trackError, trackApiLatency } from '@/lib/sentry-metrics';

const ALLOWED_TOKENS = ['USDC'];

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    try {
        assertSameOrigin(req);
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { amount, address, token, idempotencyKey, totpCode } = await req.json();

        const amountNumber = Number(amount);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
            return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
        }

        if (!address || !token) {
            return NextResponse.json({ error: 'Missing amount, address, or token' }, { status: 400 });
        }

        if (!ALLOWED_TOKENS.includes(token)) {
            return NextResponse.json({ error: 'Unsupported token' }, { status: 400 });
        }

        // Validate idempotencyKey if provided
        if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0 || idempotencyKey.length > 200)) {
            return NextResponse.json({ error: 'Invalid idempotencyKey' }, { status: 400 });
        }

        if (!ethers.isAddress(address)) {
            return NextResponse.json({ error: 'Invalid Ethereum address format' }, { status: 400 });
        }

        // Enhanced address validation: verify EIP-55 checksum to catch typos
        let checksummedAddress: string;
        try {
            checksummedAddress = ethers.getAddress(address);
        } catch {
            return NextResponse.json({
                error: 'Invalid address checksum. Please double-check the address for typos.'
            }, { status: 400 });
        }

        // Blocklist check for dangerous addresses
        const BLOCKED_ADDRESSES = new Set([
            '0x0000000000000000000000000000000000000000', // Null address
            '0x000000000000000000000000000000000000dEaD', // Common burn address
            '0xdEaD000000000000000000000000000000000000', // Another burn address
        ]);

        if (BLOCKED_ADDRESSES.has(checksummedAddress)) {
            return NextResponse.json({
                error: 'This address is not allowed for withdrawals. Please use a valid wallet address.'
            }, { status: 400 });
        }

        const user = session.user;
        const userId = user.id;

        if (!user.emailVerified) {
            return NextResponse.json({ error: 'Email must be verified to withdraw' }, { status: 403 });
        }

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

        // Use stricter withdrawal-specific rate limiting (5 per hour per user)
        const { checkWithdrawalRateLimit } = await import('@/lib/rate-limiter');
        const rateLimit = await checkWithdrawalRateLimit(userId, ip);
        if (!rateLimit.allowed) {
            const status = rateLimit.reason === 'UNAVAILABLE' ? 503 : 429;
            const message = rateLimit.reason === 'UNAVAILABLE'
                ? 'Rate limiting unavailable; please retry later'
                : `Withdrawal rate limit exceeded. You can make ${rateLimit.remaining ?? 0} more requests. Try again in ${Math.ceil((rateLimit.resetInSeconds ?? 3600) / 60)} minutes.`;
            return NextResponse.json({ error: message }, { status });
        }

        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorEnabled: true }
        });

        if (!userRecord?.twoFactorEnabled) {
            return NextResponse.json({ error: 'Two-factor authentication is required to withdraw' }, { status: 403 });
        }

        if (!totpCode) {
            return NextResponse.json({ error: 'TOTP code is required' }, { status: 401 });
        }

        // Use Better Auth's verification which handles encrypted secrets
        const isValid = await verifyUserTotp(userId, totpCode, req);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 401 });
        }

        const maxSingle = Number(process.env.WITHDRAW_MAX_SINGLE ?? 5000);
        const maxDaily = Number(process.env.WITHDRAW_MAX_DAILY ?? 20000);

        if (!Number.isFinite(maxSingle) || maxSingle <= 0 || !Number.isFinite(maxDaily) || maxDaily <= 0) {
            return NextResponse.json({ error: 'Withdrawal limits misconfigured on server' }, { status: 503 });
        }

        if (amountNumber > maxSingle) {
            return NextResponse.json({ error: `Withdrawal exceeds per-request limit of ${maxSingle}` }, { status: 400 });
        }

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
        if (usedToday + amountNumber > maxDaily) {
            const remaining = Math.max(0, maxDaily - usedToday);
            return NextResponse.json({
                error: `Daily withdrawal limit exceeded. Remaining today: ${remaining}`,
            }, { status: 400 });
        }

        // Eligibility checks: user must have placed a bet/trade and have available balance
        const [betCount, balance] = await Promise.all([
            prisma.marketActivity.count({
                where: {
                    userId,
                    type: { in: ['BET', 'TRADE'] }
                }
            }),
            prisma.balance.findFirst({
                where: {
                    userId,
                    tokenSymbol: 'TUSD',
                    eventId: null,
                    outcomeId: null
                },
                select: {
                    amount: true
                }
            })
        ]);

        if (betCount === 0) {
            return NextResponse.json({ error: 'You must place at least one bet before withdrawing' }, { status: 403 });
        }

        const available = balance ? Number(balance.amount) : 0;
        if (!Number.isFinite(available) || available <= 0) {
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
        }

        if (amountNumber > available) {
            return NextResponse.json({ error: 'Withdrawal exceeds available balance' }, { status: 400 });
        }

        const service = getCryptoService();
        const withdrawalId = await service.requestWithdrawal(userId, amountNumber, address, token, idempotencyKey);

        // Auto-approve small withdrawals (< $10)
        let isAutoApproved = false;
        if (amountNumber < 10) {
            isAutoApproved = true;
            // Fire and forget approval + notification in correct order
            (async () => {
                try {
                    // Update to APPROVED happens immediately inside approveWithdrawal update
                    await service.approveWithdrawal(withdrawalId, 'SYSTEM');
                } catch (error) {
                    console.error(`[AUTO-APPROVE] Failed for withdrawal ${withdrawalId}:`, error);
                } finally {
                    // Notify admins via Telegram (non-blocking)
                    try {
                        const { telegramNotificationService } = await import('@/lib/telegram/notification-service');
                        await telegramNotificationService.notifyWithdrawalRequest(withdrawalId);
                    } catch (notificationError) {
                        console.error('Failed to send withdrawal notification:', notificationError);
                    }
                }
            })();
        } else {
            // Standard notification for manual approval
            import('@/lib/telegram/notification-service').then(({ telegramNotificationService }) => {
                telegramNotificationService.notifyWithdrawalRequest(withdrawalId).catch((error) => {
                    console.error('Failed to send withdrawal notification:', error);
                });
            }).catch((error) => {
                console.error('Failed to load Telegram notification service:', error);
            });
        }

        // Track withdrawal request in Sentry metrics
        trackTransaction('withdrawal', isAutoApproved ? 'auto_approved' : 'pending', amountNumber);
        trackApiLatency('/api/crypto/withdraw', Date.now() - startTime, 200);

        return NextResponse.json({
            success: true,
            withdrawalId,
            status: isAutoApproved ? 'APPROVED' : 'PENDING'
        });
    } catch (error: any) {
        trackError('payment', error?.message || 'withdrawal_error');
        trackApiLatency('/api/crypto/withdraw', Date.now() - startTime, 500);

        if (error?.message?.includes('CRYPTO_MASTER_MNEMONIC')) {
            return createClientErrorResponse('Crypto service not configured', 503);
        }
        return createErrorResponse(error);
    }
}
