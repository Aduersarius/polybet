import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getCryptoService } from '@/lib/crypto-service';
import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { prisma } from '@/lib/prisma';

const ALLOWED_TOKENS = ['USDC'];

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { amount, address, token, idempotencyKey } = await req.json();

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
        if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0)) {
            return NextResponse.json({ error: 'Invalid idempotencyKey' }, { status: 400 });
        }

        if (!ethers.isAddress(address)) {
            return NextResponse.json({ error: 'Invalid Ethereum address format' }, { status: 400 });
        }

        const user = session.user;
        const userId = user.id;

        if (!user.emailVerified) {
            return NextResponse.json({ error: 'Email must be verified to withdraw' }, { status: 403 });
        }

        const rateLimitOk = await checkRateLimit(userId);
        if (!rateLimitOk) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
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
        await service.requestWithdrawal(userId, amountNumber, address, token, idempotencyKey);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error?.message?.includes('CRYPTO_MASTER_MNEMONIC')) {
            return NextResponse.json({ error: 'Crypto service not configured' }, { status: 503 });
        }
        console.error('Error requesting withdrawal:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
