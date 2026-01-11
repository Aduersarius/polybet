/**
 * Test with EOA signature type
 * Run with: npx tsx scripts/test-polymarket-eoa.ts
 */

import { Wallet } from 'ethers';
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
    console.log('=== Polymarket EOA Test (signatureType: 0) ===\n');

    const privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    // NO funder address - use EOA mode
    const apiKey = process.env.POLYMARKET_API_KEY || '';
    const apiSecret = process.env.POLYMARKET_API_SECRET || '';
    const passphrase = process.env.POLYMARKET_PASSPHRASE || '';

    const rawWallet = new Wallet(privateKey);
    const wallet = wrapWalletForV5Compat(rawWallet);

    console.log('Wallet Address:', wallet.address);
    console.log('Using signatureType: 0 (EOA mode)');
    console.log('');

    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) {
        sanitizedSecret += '=';
    }

    // Force signatureType 0 (EOA) - no funder address
    const client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        wallet as any,
        {
            key: apiKey,
            secret: sanitizedSecret,
            passphrase: passphrase,
        },
        0,  // EOA
        undefined, // No funder
        undefined,
        true
    );

    const testTokenId = '105826416199005342591038391498217708749113687972802625260881736773834354050519';

    try {
        const ob = await client.getOrderBook(testTokenId);
        const tickSize = (ob as any).tick_size || '0.01';
        const negRisk = ob.neg_risk ?? false;

        console.log('Orderbook OK. Placing order...');

        const response = await client.createAndPostOrder(
            {
                tokenID: testTokenId,
                price: 0.01,
                side: Side.BUY,
                size: 1,
            },
            { tickSize: tickSize as any, negRisk },
            OrderType.GTC
        );

        console.log('✓ Response:', JSON.stringify(response, null, 2));

        if (response?.orderID || response?.id) {
            console.log('\n🎉 SUCCESS! Order ID:', response.orderID || response.id);
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
