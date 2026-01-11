/**
 * Deep debug test for Polymarket authentication
 * Run with: npx tsx scripts/test-polymarket-debug.ts
 */

import { Wallet } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import * as crypto from 'crypto';

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

// Build HMAC signature for L2 auth
function buildHmacSignature(
    secret: string,
    timestamp: number,
    method: string,
    requestPath: string,
    body?: string
): string {
    const message = `${timestamp}${method}${requestPath}${body || ''}`;
    const secretBuffer = Buffer.from(secret, 'base64');
    const hmac = crypto.createHmac('sha256', secretBuffer);
    hmac.update(message);
    return hmac.digest('base64');
}

async function main() {
    console.log('=== Polymarket Deep Debug ===\n');

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
    console.log('  API Key:', apiKey);
    console.log('  API Secret (first 20):', apiSecret.substring(0, 20) + '...');
    console.log('  Passphrase (first 20):', passphrase.substring(0, 20) + '...');
    console.log('');

    // ==========================================
    // Test 1: Raw L2 Auth - Manual HMAC
    // ==========================================
    console.log('=== Test 1: Manual L2 Auth ===');
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/auth/api-keys';

    const signature = buildHmacSignature(apiSecret, timestamp, method, requestPath);

    console.log('  Timestamp:', timestamp);
    console.log('  Method:', method);
    console.log('  Path:', requestPath);
    console.log('  Signature:', signature);

    try {
        const response = await axios.get(`${apiUrl}${requestPath}`, {
            headers: {
                'POLY_ADDRESS': wallet.address,
                'POLY_SIGNATURE': signature,
                'POLY_TIMESTAMP': timestamp.toString(),
                'POLY_API_KEY': apiKey,
                'POLY_PASSPHRASE': passphrase,
            }
        });
        console.log('  ✓ Response:', JSON.stringify(response.data));
    } catch (err: any) {
        console.log('  ✗ Error:', err.response?.data || err.message);
    }
    console.log('');

    // ==========================================
    // Test 2: Try with FUNDER address instead of signer
    // ==========================================
    console.log('=== Test 2: L2 Auth with Funder Address ===');
    const signature2 = buildHmacSignature(apiSecret, timestamp, method, requestPath);

    try {
        const response = await axios.get(`${apiUrl}${requestPath}`, {
            headers: {
                'POLY_ADDRESS': funderAddress,  // <-- Using FUNDER address!
                'POLY_SIGNATURE': signature2,
                'POLY_TIMESTAMP': timestamp.toString(),
                'POLY_API_KEY': apiKey,
                'POLY_PASSPHRASE': passphrase,
            }
        });
        console.log('  ✓ Response:', JSON.stringify(response.data));
    } catch (err: any) {
        console.log('  ✗ Error:', err.response?.data || err.message);
    }
    console.log('');

    // ==========================================
    // Test 3: Use CLOB client without credentials first
    // ==========================================
    console.log('=== Test 3: CLOB Client - Derive Keys with L1 Auth ===');
    const clientNoL2 = new ClobClient(
        apiUrl,
        137,
        wallet as any,
        undefined,  // No L2 creds
        funderAddress ? 1 : 0,
        funderAddress || undefined
    );

    try {
        // First try to derive (uses L1 auth)
        console.log('  Calling deriveApiKey()...');
        const derived = await clientNoL2.deriveApiKey();
        console.log('  ✓ Derived key:', JSON.stringify(derived));
    } catch (err: any) {
        console.log('  ✗ Derive failed:', err.message);
        if (err.response) {
            console.log('    Response:', JSON.stringify(err.response.data));
        }
    }

    try {
        // Try to create new key
        console.log('  Calling createApiKey()...');
        const created = await clientNoL2.createApiKey();
        console.log('  ✓ Created key:', JSON.stringify(created));
    } catch (err: any) {
        console.log('  ✗ Create failed:', err.message);
        if (err.response) {
            console.log('    Response:', JSON.stringify(err.response.data));
        }
    }
    console.log('');

    // ==========================================
    // Test 4: Check if there's an API key nonce issue
    // ==========================================
    console.log('=== Test 4: L1 Auth with Different Nonce ===');

    // Create new client with useServerTime
    const clientWithServerTime = new ClobClient(
        apiUrl,
        137,
        wallet as any,
        undefined,
        funderAddress ? 1 : 0,
        funderAddress || undefined,
        undefined,  // geoBlockToken
        true        // useServerTime = TRUE
    );

    try {
        console.log('  Calling createOrDeriveApiKey() with server time...');
        const creds = await clientWithServerTime.createOrDeriveApiKey();
        console.log('  ✓ Got credentials:', JSON.stringify(creds));
    } catch (err: any) {
        console.log('  ✗ Failed:', err.message);
        if (err.response) {
            console.log('    Response:', JSON.stringify(err.response.data));
        }
    }
    console.log('');

    // ==========================================
    // Test 5: Check balance on Polymarket
    // ==========================================
    console.log('=== Test 5: Check if wallet has balance ===');
    try {
        const balanceUrl = `https://clob.polymarket.com/balance-allowance?signature_type=${funderAddress ? 1 : 0}`;
        const ts = Math.floor(Date.now() / 1000);
        const sig = buildHmacSignature(apiSecret, ts, 'GET', '/balance-allowance');

        const response = await axios.get(balanceUrl, {
            headers: {
                'POLY_ADDRESS': wallet.address,
                'POLY_SIGNATURE': sig,
                'POLY_TIMESTAMP': ts.toString(),
                'POLY_API_KEY': apiKey,
                'POLY_PASSPHRASE': passphrase,
            }
        });
        console.log('  ✓ Balance:', JSON.stringify(response.data));
    } catch (err: any) {
        console.log('  ✗ Balance check failed:', err.response?.data || err.message);
    }
    console.log('');

    // ==========================================
    // Test 6: Get all API keys for this wallet via L1
    // ==========================================
    console.log('=== Test 6: Get API Keys via L1 Auth ===');
    try {
        const keys = await clientNoL2.getApiKeys();
        console.log('  ✓ API Keys:', JSON.stringify(keys));
    } catch (err: any) {
        console.log('  ✗ Get keys failed:', err.message);
        if (err.response) {
            console.log('    Response:', JSON.stringify(err.response.data));
        }
    }

    console.log('\n=== Debug Complete ===');
}

main().catch(console.error);
