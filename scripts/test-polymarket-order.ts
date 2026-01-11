/**
 * Test script for Polymarket trading
 * Run with: npx tsx scripts/test-polymarket-order.ts
 */

import { Wallet } from 'ethers';
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Explicitly load .env from project root
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
    console.log('=== Polymarket Trading Test ===\n');

    // Load credentials
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS || '';
    const apiKey = process.env.POLYMARKET_API_KEY || '';
    const apiSecret = process.env.POLYMARKET_API_SECRET || '';
    const passphrase = process.env.POLYMARKET_PASSPHRASE || '';
    const apiUrl = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
    const chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137');

    // Create wallet with v5 compatibility wrapper
    const rawWallet = new Wallet(privateKey);
    const wallet = wrapWalletForV5Compat(rawWallet);
    console.log('Signer Wallet Address:', wallet.address);
    console.log('Funder/Proxy Address:', funderAddress);
    console.log('API Key:', apiKey);
    console.log('API Secret:', apiSecret.substring(0, 20) + '...');
    console.log('Passphrase:', passphrase.substring(0, 20) + '...');
    console.log('');

    // Determine signature type
    const signatureType = funderAddress ? 1 : 0;
    console.log('Signature Type:', signatureType, signatureType === 1 ? '(Proxy mode)' : '(EOA mode)');
    console.log('');

    // Sanitize secret (URL-safe base64 to standard)
    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) {
        sanitizedSecret += '=';
    }

    // Create CLOB client with credentials
    const creds = apiKey && sanitizedSecret && passphrase ? {
        key: apiKey,
        secret: sanitizedSecret,
        passphrase: passphrase,
    } : undefined;

    console.log('Creating CLOB client...');
    const client = new ClobClient(
        apiUrl,
        chainId,
        wallet as any,
        creds,
        signatureType,
        funderAddress || undefined
    );
    console.log('CLOB client created.\n');

    // Test 1: Get server time (no auth required)
    console.log('Test 1: Get server time...');
    try {
        const serverTime = await client.getServerTime();
        console.log('✓ Server time:', serverTime);
        console.log('  Local time:', Math.floor(Date.now() / 1000));
        console.log('  Diff:', Math.abs(serverTime - Math.floor(Date.now() / 1000)), 'seconds');
    } catch (err: any) {
        console.log('✗ Failed to get server time:', err.message);
    }
    console.log('');

    // Test 2: Get orderbook (no auth required)
    const testTokenId = '105826416199005342591038391498217708749113687972802625260881736773834354050519';
    console.log('Test 2: Get orderbook for token...');
    try {
        const orderbook = await client.getOrderBook(testTokenId);
        console.log('✓ Orderbook retrieved');
        console.log('  Best bid:', orderbook.bids?.[0]?.price || 'none');
        console.log('  Best ask:', orderbook.asks?.[0]?.price || 'none');
    } catch (err: any) {
        console.log('✗ Failed to get orderbook:', err.message);
    }
    console.log('');

    // Test 3: Get API keys (requires auth)
    console.log('Test 3: Get API keys (requires L2 auth)...');
    try {
        const apiKeys = await client.getApiKeys();
        console.log('✓ API keys retrieved:', apiKeys?.length || 0, 'keys');
    } catch (err: any) {
        console.log('✗ Failed to get API keys:', err.message);
        if (err.response) {
            console.log('  Response:', JSON.stringify(err.response.data));
        }
    }
    console.log('');

    // Test 4: Create and derive API key 
    console.log('Test 4: Try createOrDeriveApiKey...');
    try {
        const derivedCreds = await client.createOrDeriveApiKey();
        console.log('✓ Derived credentials:');
        console.log('  API Key:', derivedCreds?.apiKey || 'none');
    } catch (err: any) {
        console.log('✗ Failed to derive API key:', err.message);
        if (err.response) {
            console.log('  Response:', JSON.stringify(err.response.data));
        }
    }
    console.log('');

    // Test 5: Get balance allowance (requires auth)
    console.log('Test 5: Get balance allowance (requires L2 auth)...');
    try {
        const balance = await client.getBalanceAllowance();
        console.log('✓ Balance retrieved:', JSON.stringify(balance));
    } catch (err: any) {
        console.log('✗ Failed to get balance:', err.message);
        if (err.response) {
            console.log('  Response:', JSON.stringify(err.response.data));
        }
    }
    console.log('');

    // Test 6: Try to place a small test order
    console.log('Test 6: Place test order...');
    try {
        // Get orderbook to find a reasonable price
        const ob = await client.getOrderBook(testTokenId);
        const tickSize = (ob as any).tick_size || '0.01';
        const negRisk = ob.neg_risk ?? false;

        // Use best bid - 0.10 to ensure it won't fill immediately
        const bestBid = parseFloat(ob.bids?.[0]?.price || '0.10');
        const testPrice = Math.max(0.01, bestBid - 0.10);
        const testSize = 1; // Small size for testing

        console.log(`  Placing order: BUY ${testSize} shares @ ${testPrice}`);

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

        console.log('✓ Order placed successfully!');
        console.log('  Order ID:', response?.orderID || response?.id || 'unknown');
        console.log('  Full response:', JSON.stringify(response).substring(0, 200));
    } catch (err: any) {
        console.log('✗ Failed to place order:', err.message);
        if (err.response) {
            console.log('  Status:', err.response.status);
            console.log('  Data:', JSON.stringify(err.response.data));
        }
    }

    console.log('\n=== Test Complete ===');
}

main().catch(console.error);
