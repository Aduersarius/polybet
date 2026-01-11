
import { Wallet } from 'ethers';
import { ClobClient, ApiKeyCreds } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    console.log('--- Polymarket Auth Diagnostic ---');

    const privateKey = (process.env.POLYMARKET_PRIVATE_KEY || '').trim();
    const apiKey = (process.env.POLYMARKET_API_KEY || '').trim();
    const apiSecret = (process.env.POLYMARKET_API_SECRET || '').trim();
    const passphrase = (process.env.POLYMARKET_PASSPHRASE || '').trim();
    const funderAddress = (process.env.POLYMARKET_FUNDER_ADDRESS || '').trim();
    const chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137');

    if (!privateKey || !apiKey || !apiSecret || !passphrase) {
        console.error('❌ Missing credentials in .env');
        return;
    }

    // 1. Validate Wallet / Signer
    let wallet;
    try {
        wallet = new Wallet(privateKey);
        console.log(`✅ Private Key is valid.`);
        console.log(`   Signer Address: ${wallet.address}`);
    } catch (e) {
        console.error('❌ Invalid Private Key:', e.message);
        return;
    }

    if (funderAddress) {
        console.log(`   Funder Address: ${funderAddress}`);
        if (wallet.address.toLowerCase() === funderAddress.toLowerCase()) {
            console.warn('   ⚠️  Signer is same as Funder. If using Proxy, Signer should be different.');
        } else {
            console.log('   ℹ️  Using Proxy Mode (Signer != Funder)');
        }
    }

    // 2. sanitize Secret
    let cleanSecret = apiSecret.replace(/\s+/g, '');
    cleanSecret = cleanSecret.replace(/-/g, '+').replace(/_/g, '/');
    cleanSecret = cleanSecret.replace(/[^A-Za-z0-9+/=]/g, '');
    while (cleanSecret.length % 4) cleanSecret += '=';

    if (cleanSecret !== apiSecret) {
        console.log('ℹ️  Sanitized API Secret (removed whitespace/fixed padding)');
    }

    // 3. Initialize Client - Try Both Modes
    console.log('Testing Authentication Modes...');

    const modes = [
        { type: 0, name: 'EOA (Direct Wallet)' },
        { type: 1, name: 'Proxy (Funder Address)' }
    ];

    for (const mode of modes) {
        // Skip proxy/funder check if no funder address provided for type 1
        if (mode.type === 1 && !funderAddress) {
            console.log(`[Skipping] ${mode.name}: No POLYMARKET_FUNDER_ADDRESS provided.`);
            continue;
        }

        console.log(`\n--- Attempting Mode: ${mode.name} (SigType: ${mode.type}) ---`);

        try {
            const client = new ClobClient(
                'https://clob.polymarket.com',
                chainId,
                wallet,
                creds,
                mode.type,
                mode.type === 1 ? funderAddress : undefined
            );

            console.log(`   Requesting API Keys status...`);
            const keys = await client.getApiKeys();

            // Check if the response is actually an error object (ClobClient quirk)
            if (keys && (keys as any).error) {
                console.error(`❌ Failed: ${(keys as any).error}`);
                if ((keys as any).status === 401) {
                    console.error(`   Hint: 401 usually means Invalid API Key, Secret, or Passphrase.`);
                }
            } else {
                console.log('✅ SUCCEEDED!');
                console.log('   API Key Details:', JSON.stringify(keys, null, 2));
                console.log(`\n🎉 CONCLUSION: You should use Signature Type ${mode.type} (${mode.name})`);
                if (mode.type === 1) {
                    console.log('   Ensure POLYMARKET_FUNDER_ADDRESS is set in .env');
                } else {
                    console.log('   Ensure POLYMARKET_FUNDER_ADDRESS is REMOVED from .env');
                }
                return; // Exit on first success
            }

        } catch (error: any) {
            console.error(`❌ Failed: ${error.message}`);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data));
            }
        }
    }

    console.log('\n❌ ALL ATTEMPTS FAILED.');
    console.log('Possible causes:');
    console.log('1. Passphrase is wrong (Are you using the Hash instead of Plaintext?)');
    console.log('2. API Key does not match the Wallet Private Key.');
    console.log('3. API Secret is corrupted (we sanitized it, so maybe copy-paste error?)');
}

main().catch(console.error);
