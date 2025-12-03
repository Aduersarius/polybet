import { NextRequest, NextResponse } from 'next/server';
import { cryptoService } from '@/lib/crypto-service';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const address = await cryptoService.getDepositAddress(userId, 'USDC');

        return NextResponse.json({ address, currency: 'USDC', network: 'Polygon' });
    } catch (error) {
        console.error('Error getting deposit address:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
