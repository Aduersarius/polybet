/**
 * Check positions on Polymarket
 */

import { Wallet, Contract } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { JsonRpcProvider } from 'ethers';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Conditional Tokens contract on Polygon
const CT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CT_ABI = [
    'function balanceOf(address account, uint256 id) view returns (uint256)',
];

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
    const provider = new JsonRpcProvider('https://polygon-rpc.com');
    const rawWallet = new Wallet(process.env.POLYMARKET_PRIVATE_KEY!, provider);
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
        0,
        undefined,
        undefined,
        true
    );

    console.log('=== Polymarket Positions ===\n');
    console.log('Wallet:', wallet.address);
    console.log('');

    // Get user positions from Polymarket (if they have an endpoint for it)
    // Alternatively we query trades and calculate

    try {
        const trades = await client.getTrades();

        // Calculate net positions from trades
        const positions: { [tokenId: string]: { shares: number, avgPrice: number, cost: number, side: string } } = {};

        if (trades && trades.length > 0) {
            console.log(`Calculating positions from ${trades.length} trades...\n`);

            for (const trade of trades) {
                const tokenId = trade.asset_id || trade.token_id;
                if (!tokenId) continue;

                const size = parseFloat(trade.size) || 0;
                const price = parseFloat(trade.price) || 0;

                if (!positions[tokenId]) {
                    positions[tokenId] = { shares: 0, avgPrice: 0, cost: 0, side: '' };
                }

                if (trade.side === 'BUY') {
                    positions[tokenId].shares += size;
                    positions[tokenId].cost += size * price;
                } else {
                    positions[tokenId].shares -= size;
                    positions[tokenId].cost -= size * price;
                }
            }

            console.log('Net Positions:\n');
            let i = 1;
            for (const [tokenId, pos] of Object.entries(positions)) {
                if (pos.shares !== 0) {
                    console.log(`Position ${i++}:`);
                    console.log(`  Token ID: ${tokenId.substring(0, 20)}...`);
                    console.log(`  Shares: ${pos.shares.toFixed(4)}`);
                    console.log(`  Net Cost: $${pos.cost.toFixed(4)}`);
                    if (pos.shares > 0) {
                        console.log(`  Avg Price: $${(pos.cost / pos.shares).toFixed(4)}`);
                    }
                    console.log('');
                }
            }

            if (Object.values(positions).filter(p => p.shares !== 0).length === 0) {
                console.log('No open positions (all trades are closed out).');
            }
        } else {
            console.log('No trades found.');
        }
    } catch (e: any) {
        console.log('Error:', e.response?.data || e.message);
    }

    // Also check on-chain balance of a known token
    console.log('\n=== On-Chain Token Balance Check ===\n');
    const testTokenId = '105826416199005342591038391498217708749113687972802625260881736773834354050519';

    try {
        const ct = new Contract(CT_ADDRESS, CT_ABI, provider);
        const balance = await ct.balanceOf(wallet.address, testTokenId);
        console.log(`Token ${testTokenId.substring(0, 20)}...`);
        console.log(`On-chain balance: ${(Number(balance) / 1e6).toFixed(4)} shares`);
    } catch (e: any) {
        console.log('Error checking on-chain balance:', e.message);
    }
}

main().catch(console.error);
