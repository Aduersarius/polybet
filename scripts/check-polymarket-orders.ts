/**
 * Check open orders on Polymarket
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

    const client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        wallet as any,
        {
            key: process.env.POLYMARKET_API_KEY!,
            secret,
            passphrase: process.env.POLYMARKET_PASSPHRASE!,
        },
        0,  // EOA mode
        undefined,
        undefined,
        true
    );

    console.log('=== Polymarket Open Orders ===\n');
    console.log('Wallet:', wallet.address);
    console.log('');

    try {
        const orders = await client.getOpenOrders();

        if (!orders || orders.length === 0) {
            console.log('No open orders found.');
        } else {
            console.log(`Found ${orders.length} open orders:\n`);
            orders.forEach((order: any, i: number) => {
                console.log(`Order ${i + 1}:`);
                console.log(`  ID: ${order.id || order.orderID}`);
                console.log(`  Side: ${order.side}`);
                console.log(`  Price: ${order.price}`);
                console.log(`  Size: ${order.size || order.original_size}`);
                console.log(`  Filled: ${order.size_matched || 0}`);
                console.log(`  Status: ${order.status}`);
                console.log('');
            });
        }
    } catch (e: any) {
        console.log('Error:', e.response?.data || e.message);
    }

    // Also get trade history
    console.log('\n=== Recent Trades ===\n');
    try {
        const trades = await client.getTrades();

        if (!trades || trades.length === 0) {
            console.log('No trades found.');
        } else {
            console.log(`Found ${trades.length} trades:\n`);
            trades.slice(0, 5).forEach((trade: any, i: number) => {
                console.log(`Trade ${i + 1}:`);
                console.log(`  Side: ${trade.side}`);
                console.log(`  Price: ${trade.price}`);
                console.log(`  Size: ${trade.size}`);
                console.log(`  Status: ${trade.status}`);
                console.log('');
            });
        }
    } catch (e: any) {
        console.log('Error getting trades:', e.response?.data || e.message);
    }
}

main().catch(console.error);
