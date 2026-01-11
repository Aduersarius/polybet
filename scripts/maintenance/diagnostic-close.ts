
import 'dotenv/config';
import { Wallet, ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Use manual parsing to ensure we get the right one
const envConfig = dotenv.parse(fs.readFileSync('.env'));

const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const TOKEN_ID = "105826416199005342591038391498217708749113687972802625260881736773834354050519";

async function diagnostic() {
    console.log("🔍 Running Deep Diagnostic for Position Close...");

    // Use the PK starting with 0x3c32...
    const privateKey = envConfig.POLYMARKET_PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
    const wallet = new Wallet(privateKey, provider);

    console.log(`Verifying Wallet: ${wallet.address}`);

    const apiSecret = envConfig.POLYMARKET_API_SECRET;
    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) sanitizedSecret += '=';

    const client = new ClobClient(
        "https://clob.polymarket.com",
        137,
        wallet as any,
        {
            key: envConfig.POLYMARKET_API_KEY,
            secret: sanitizedSecret,
            passphrase: envConfig.POLYMARKET_PASSPHRASE,
        },
        0
    );

    try {
        console.log("Fetching balance...");
        const ctf = new ethers.Contract(CTF_ADDRESS, ["function balanceOf(address, uint256) view returns (uint256)"], provider);
        const bal = await ctf.balanceOf(wallet.address, TOKEN_ID);
        console.log(`Balance: ${bal.toString()}`);

        console.log("Fetching Open Orders...");
        const openOrders = await client.getOpenOrders();
        console.log(`Found ${openOrders.length} total open orders.`);

        const staleOrders = openOrders.filter((o: any) => (o.asset_id || o.token_id) === TOKEN_ID);
        if (staleOrders.length > 0) {
            console.log(`⚠️ Cleaning up ${staleOrders.length} stale orders for this token...`);
            for (const o of staleOrders) {
                console.log(`Cancelling order ${o.orderID || o.id}...`);
                await client.cancelOrder(o.orderID || o.id);
            }
            console.log("✅ Cleanup complete.");
        } else {
            console.log("No stale orders found.");
        }

    } catch (e: any) {
        console.error("❌ Diagnostic error:", e.message);
        if (e.response) console.error("Response data:", e.response.data);
    }
}

diagnostic();
