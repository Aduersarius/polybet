import { NextRequest, NextResponse } from 'next/server';
import { Wallet } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';

// Function to wrap wallet for ethers v6 compatibility
function wrapWalletForV5Compat(wallet: Wallet): Wallet {
    const wrappedWallet = wallet as any;
    if (!wrappedWallet._signTypedData && wrappedWallet.signTypedData) {
        wrappedWallet._signTypedData = function (
            domain: any,
            types: any,
            value: any
        ): Promise<string> {
            return this.signTypedData(domain, types, value);
        };
    }
    return wrappedWallet as Wallet;
}

function getClobClient() {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiSecret = process.env.POLYMARKET_API_SECRET;
    const passphrase = process.env.POLYMARKET_PASSPHRASE;
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

    if (!privateKey || !apiKey || !apiSecret || !passphrase) {
        throw new Error('Polymarket credentials not configured');
    }

    const rawWallet = new Wallet(privateKey);
    const wallet = wrapWalletForV5Compat(rawWallet);

    // Sanitize secret
    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) {
        sanitizedSecret += '=';
    }

    const signatureType = funderAddress ? 1 : 0;

    return new ClobClient(
        process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com',
        parseInt(process.env.POLYMARKET_CHAIN_ID || '137'),
        wallet as any,
        {
            key: apiKey,
            secret: sanitizedSecret,
            passphrase: passphrase,
        },
        signatureType,
        funderAddress || undefined,
        undefined,
        true // useServerTime
    );
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const tokenId = searchParams.get('tokenId');

        if (!tokenId) {
            return NextResponse.json({ error: 'Missing tokenId parameter' }, { status: 400 });
        }

        console.log(`[Admin Polymarket API] Cancelling all orders for token: ${tokenId}`);

        const client = getClobClient();

        // Get all open orders
        const openOrders = await client.getOpenOrders();

        // Filter orders for this token
        const tokenOrders = openOrders.filter((o: any) =>
            (o.asset_id === tokenId || o.token_id === tokenId)
        );

        console.log(`[Admin Polymarket API] Found ${tokenOrders.length} open orders to cancel`);

        // Cancel each order
        const results = [];
        for (const order of tokenOrders) {
            try {
                const orderId = order.id || order.orderID;
                console.log(`[Admin Polymarket API] Cancelling order: ${orderId}`);
                await client.cancelOrder({ orderID: orderId });
                results.push({ orderId, success: true });
            } catch (e: any) {
                console.error(`[Admin Polymarket API] Failed to cancel order:`, e);
                results.push({ orderId: order.id || order.orderID, success: false, error: e.message });
            }
        }

        return NextResponse.json({
            success: true,
            cancelledCount: results.filter(r => r.success).length,
            failedCount: results.filter(r => !r.success).length,
            results
        });
    } catch (error) {
        console.error('[Polymarket API] Error cancelling orders:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to cancel orders' },
            { status: 500 }
        );
    }
}
