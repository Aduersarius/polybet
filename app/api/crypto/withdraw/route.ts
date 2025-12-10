import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { cryptoService } from '@/lib/crypto-service';
import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { amount, address, token, idempotencyKey } = await req.json();

        if (!amount || !address || !token) {
            return NextResponse.json({ error: 'Missing amount, address, or token' }, { status: 400 });
        }

        // Validate idempotencyKey if provided
        if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0)) {
            return NextResponse.json({ error: 'Invalid idempotencyKey' }, { status: 400 });
        }

        if (!ethers.isAddress(address)) {
            return NextResponse.json({ error: 'Invalid Ethereum address format' }, { status: 400 });
        }

        const userId = session.user.id;

        const rateLimitOk = await checkRateLimit(userId);
        if (!rateLimitOk) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        await cryptoService.requestWithdrawal(userId, parseFloat(amount), address, token, idempotencyKey);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error requesting withdrawal:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
