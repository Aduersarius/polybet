/**
 * Debug EIP-712 signing
 * Run with: npx tsx scripts/test-polymarket-signing.ts
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
        wrappedWallet._signTypedData = async function (
            domain: any,
            types: any,
            value: any
        ): Promise<string> {
            console.log('[EIP712] Signing typed data:');
            console.log('  Domain:', JSON.stringify(domain, null, 2));
            console.log('  Types:', JSON.stringify(types, null, 2));
            console.log('  Value:', JSON.stringify(value, null, 2));

            const signature = await this.signTypedData(domain, types, value);
            console.log('  Signature:', signature);
            return signature;
        };
    }
    return wrappedWallet as Wallet;
}

async function main() {
    console.log('=== EIP-712 Signing Debug ===\n');

    const privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS || '';
    const apiKey = process.env.POLYMARKET_API_KEY || '';
    const apiSecret = process.env.POLYMARKET_API_SECRET || '';
    const passphrase = process.env.POLYMARKET_PASSPHRASE || '';

    const rawWallet = new Wallet(privateKey);
    const wallet = wrapWalletForV5Compat(rawWallet);

    console.log('Wallet Address:', wallet.address);
    console.log('Funder Address:', funderAddress);
    console.log('');

    // Sanitize secret
    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) {
        sanitizedSecret += '=';
    }

    const signatureType = funderAddress ? 1 : 0;

    const client = new ClobClient(
        'https://clob.polymarket.com',
        137,
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

    const testTokenId = '105826416199005342591038391498217708749113687972802625260881736773834354050519';

    try {
        const ob = await client.getOrderBook(testTokenId);
        const tickSize = (ob as any).tick_size || '0.01';
        const negRisk = ob.neg_risk ?? false;

        console.log('Orderbook negRisk:', negRisk);
        console.log('Tick Size:', tickSize);
        console.log('');

        console.log('Creating order (will log EIP-712 data)...');

        // Just create the order without posting to see the signature process
        const order = await client.createOrder(
            {
                tokenID: testTokenId,
                price: 0.01,
                side: Side.BUY,
                size: 1,
            },
            { tickSize: tickSize as any, negRisk }
        );

        console.log('\n=== Created Order ===');
        console.log(JSON.stringify(order, null, 2));

        // Also try posting to see full error
        console.log('\n=== Posting Order ===');
        const response = await client.postOrder(order, OrderType.GTC);
        console.log('Response:', JSON.stringify(response, null, 2));
    } catch (err: any) {
        console.log('\n✗ Error:', err.message);
        if (err.response) {
            console.log('  Status:', err.response.status);
            console.log('  Data:', JSON.stringify(err.response.data, null, 2));
        }
    }

    console.log('\n=== Debug Complete ===');
}

main().catch(console.error);
