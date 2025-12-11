import { NextRequest, NextResponse } from 'next/server';
import { getCryptoService } from '@/lib/crypto-service';
import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
        const rateLimit = await checkRateLimit(userId, ip);
        if (!rateLimit.allowed) {
            const status = rateLimit.reason === 'UNAVAILABLE' ? 503 : 429;
            const message = rateLimit.reason === 'UNAVAILABLE'
                ? 'Rate limiting unavailable; please retry later'
                : 'Rate limit exceeded';
            return NextResponse.json({ error: message }, { status });
        }

        try {
            const service = getCryptoService();
            const address = await service.getDepositAddress(userId, 'USDC');
            return NextResponse.json({ address, currency: 'USDC', network: 'Polygon' });
        } catch (serviceError: any) {
            const isConfigError = serviceError?.message?.includes('CRYPTO_MASTER_MNEMONIC');
            const isProd = process.env.NODE_ENV === 'production';

            // In non-prod, fall back to a mock address so the UI keeps working
            if (isConfigError && !isProd) {
                const mockAddress = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD0001';
                console.warn('crypto/deposit: using mock address because crypto service is not configured');
                return NextResponse.json({ address: mockAddress, currency: 'USDC', network: 'Polygon', mock: true });
            }

            if (isConfigError) {
                return NextResponse.json({ error: 'Crypto service not configured' }, { status: 503 });
            }
            throw serviceError;
        }
    } catch (error: any) {
        if (error?.message?.includes('CRYPTO_MASTER_MNEMONIC')) {
            return NextResponse.json({ error: 'Crypto service not configured' }, { status: 503 });
        }
        console.error('Error getting deposit address:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
