import { NextRequest, NextResponse } from 'next/server';
import { cryptoService } from '@/lib/crypto-service';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { amount, address } = await req.json();

        if (!amount || !address) {
            return NextResponse.json({ error: 'Missing amount or address' }, { status: 400 });
        }

        const userId = session.user.id;
        await cryptoService.requestWithdrawal(userId, parseFloat(amount), address, 'USDC');

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error requesting withdrawal:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
