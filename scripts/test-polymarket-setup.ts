/**
 * Setup allowances for EOA trading
 */

import { Wallet } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function wrapWalletForV5Compat(wallet: Wallet): Wallet {
    const wrappedWallet = wallet as any;
    if (!wrappedWallet._signTypedData && wrappedWallet.signTypedData) {
        wrappedWallet._signTypedData = function (d: any, t: any, v: any) {
            return this.signTypedData(d, t, v);
        };
    }
    return wrappedWallet as Wallet;
}

async function main() {
    const rawWallet = new Wallet(process.env.POLYMARKET_PRIVATE_KEY!);
    const wallet = wrapWalletForV5Compat(rawWallet);

    let secret = process.env.POLYMARKET_API_SECRET!;
    secret = secret.replace(/-/g, '+').replace(/_/g, '/');
    while (secret.length % 4) secret += '=';

    const creds = {
        key: process.env.POLYMARKET_API_KEY!,
        secret,
        passphrase: process.env.POLYMARKET_PASSPHRASE!,
    };

    console.log('Wallet:', wallet.address);
    console.log('');

    // EOA mode
    const client = new ClobClient(
        'https://clob.polymarket.com', 137, wallet as any, creds, 0, undefined, undefined, true
    );

    console.log('Calling updateBalanceAllowance to set up trading...');
    try {
        await client.updateBalanceAllowance();
        console.log('✓ Balance allowance updated!');
    } catch (e: any) {
        console.log('Error:', e.response?.data || e.message);
    }

    // Now try getting balance without asset_type
    console.log('\nGetting balance...');
    try {
        const bal = await client.getBalanceAllowance();
        console.log('Balance:', JSON.stringify(bal, null, 2));
    } catch (e: any) {
        console.log('Error:', e.response?.data || e.message);
    }
}

main().catch(console.error);
