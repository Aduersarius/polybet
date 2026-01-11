/**
 * Final test - place a real order
 * Run with: npx tsx scripts/test-polymarket-final.ts
 */

import { Wallet } from 'ethers';
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Wrap wallet for ethers v6 compatibility
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

async function main() {
    console.log('=== Polymarket Final Order Test ===\n');

    const privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS || '';
    const apiKey = process.env.POLYMARKET_API_KEY || '';
    const apiSecret = process.env.POLYMARKET_API_SECRET || '';
    const passphrase = process.env.POLYMARKET_PASSPHRASE || '';
    const apiUrl = 'https://clob.polymarket.com';

    const rawWallet = new Wallet(privateKey);
    const wallet = wrapWalletForV5Compat(rawWallet);

    console.log('Configuration:');
    console.log('  Signer Address:', wallet.address);
    console.log('  Funder Address:', funderAddress);

    // Sanitize secret
    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) {
        sanitizedSecret += '=';
    }

    const signatureType = funderAddress ? 1 : 0;
    console.log('  Signature Type:', signatureType);
    console.log('');

    // Create client with credentials
    const client = new ClobClient(
        apiUrl,
        137,
        wallet as any,
        {
            key: apiKey,
            secret: sanitizedSecret,
            passphrase: passphrase,
        },
        signatureType,
        funderAddress || undefined,
        undefined,  // geoBlockToken
        true       // useServerTime
    );

    // Get a market with good liquidity
    console.log('Fetching a market with liquidity...\n');

    // Token ID from the actual hedge attempts in your app
    const testTokenId = '105826416199005342591038391498217708749113687972802625260881736773834354050519';

    try {
        const ob = await client.getOrderBook(testTokenId);
        console.log('Orderbook:');
        console.log('  Best Bid:', ob.bids?.[0]?.price, '@ size', ob.bids?.[0]?.size);
        console.log('  Best Ask:', ob.asks?.[0]?.price, '@ size', ob.asks?.[0]?.size);
        console.log('  Tick Size:', (ob as any).tick_size);
        console.log('  Neg Risk:', ob.neg_risk);
        console.log('');

        // Try to place a very small test order
        const tickSize = (ob as any).tick_size || '0.01';
        const negRisk = ob.neg_risk ?? false;

        // Price at 0.01 (very low, won't fill)
        const testPrice = 0.01;
        const testSize = 1;

        console.log(`Placing test order: BUY ${testSize} shares @ ${testPrice}...`);

        const response = await client.createAndPostOrder(
            {
                tokenID: testTokenId,
                price: testPrice,
                side: Side.BUY,
                size: testSize,
            },
            { tickSize: tickSize as any, negRisk },
            OrderType.GTC
        );

        console.log('✓ Order response:', JSON.stringify(response, null, 2));

        if (response?.orderID || response?.id) {
            console.log('\n🎉 SUCCESS! Order placed with ID:', response.orderID || response.id);
        } else if (response?.error) {
            console.log('\n❌ Order failed:', response.error);
        }
    } catch (err: any) {
        console.log('✗ Error:', err.message);
        if (err.response) {
            console.log('  Status:', err.response.status);
            console.log('  Data:', JSON.stringify(err.response.data, null, 2));
        }
    }

    console.log('\n=== Test Complete ===');
}

main().catch(console.error);
