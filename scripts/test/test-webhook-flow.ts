
import 'dotenv/config';
import { prisma } from '../../lib/prisma';
import { createHmac } from 'crypto';
import { ethers } from 'ethers';

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/deposits';
const MOCK_SIGNING_KEY = 'test-secret';
const USDC_ADDRESS = (process.env.USDC_CONTRACT_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359').toLowerCase();

async function main() {
    console.log('🧪 Starting Webhook Verification Test...');

    // 1. Find a test user with a deposit address
    // Prefer test-user if exists, else first user
    const user = await prisma.user.findFirst({
        where: {
            depositAddresses: { some: {} }
        },
        include: { depositAddresses: true }
    });

    if (!user || !user.depositAddresses[0]) {
        console.error('❌ No user with deposit address found. Please run seed or create a user manually.');
        process.exit(1);
    }

    const depositAddress = user.depositAddresses[0].address;
    const userId = user.id;
    console.log(`👤 Using User: ${userId}`);
    console.log(`🏦 Deposit Address: ${depositAddress}`);

    const initialBalance = Number(user.currentBalance);
    console.log(`💰 Initial Balance: $${initialBalance}`);

    // 2. Prepare Payload
    const amount = 10.0; // 10 USDC
    const fee = amount * 0.01;
    const expectedCredit = amount - fee;

    const mockHash = `0x${Array(64).fill('0').map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const amountRaw = ethers.parseUnits(amount.toString(), 6).toString(); // USDC 6 decimals

    const payload = {
        webhookId: 'wh_test_123',
        id: 'evt_test_123',
        createdAt: new Date().toISOString(),
        type: 'ADDRESS_ACTIVITY',
        event: {
            network: 'MATIC_MAINNET',
            activity: [{
                category: 'token',
                fromAddress: '0xsenderaddress',
                toAddress: depositAddress, // Matches our user
                blockNum: '0x123',
                hash: mockHash,
                value: null, // Logic uses rawContract.rawValue
                asset: 'USDC',
                rawContract: {
                    rawValue: amountRaw, // Hex string usually, but library parses string ok? Webhook sends hex string usually.
                    // Wait, Alchemy sends hex string for rawValue usually.
                    // "0x" + BigInt(amountRaw).toString(16)
                    address: USDC_ADDRESS,
                    decimals: 6
                },
                log: {
                    address: USDC_ADDRESS,
                    topics: [],
                    data: '0x'
                }
            }]
        }
    };

    // Fix rawValue to be hex as per Alchemy spec
    payload.event.activity[0].rawContract.rawValue = "0x" + BigInt(amountRaw).toString(16);

    const body = JSON.stringify(payload);

    // 3. Sign Payload
    // Note: In real app, we use env var. Here we need to mock the server env var?
    // The server is running via `npm run dev`. It uses `.env`.
    // We can't inject the key easily into the running server unless we modify .env.
    // Instead, let's assume valid key is set in .env? Or we verify logical correctness.

    // Actually, to make this test work against localhost, localhost MUST have ALCHEMY_WEBHOOK_SIGNING_KEY set.
    // If it's not set, the route will 500.

    console.log('⚠️  NOTE: Ensuring ALCHEMY_WEBHOOK_SIGNING_KEY is set in your .env');
    // We will simulate the POST request. But we need to match the signature.
    // I will read the .env file to get the REAL key if present, or use the mock key if I can setting it temporarily.
    // I can't set it in the running server.

    // Let's assume the user has set ALCHEMY_WEBHOOK_SIGNING_KEY="test-secret" or I will fail.
    // Better: I will try to read it from process.env (loaded by dotenv).

    const serverKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
    if (!serverKey) {
        console.error('❌ ALCHEMY_WEBHOOK_SIGNING_KEY not set in .env. Cannot verify signature on server side.');
        console.log('Please add ALCHEMY_WEBHOOK_SIGNING_KEY="test-secret" to .env and restart server.');
        process.exit(1);
    }

    const hmac = createHmac('sha256', serverKey);
    hmac.update(body, 'utf8');
    const signature = hmac.digest('hex');

    console.log(`📡 Sending Webhook... (Hash: ${mockHash})`);

    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-alchemy-signature': signature
        },
        body: body
    });

    if (res.status !== 200) {
        console.error(`❌ Webhook Failed: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.error('Response:', text);
        process.exit(1);
    }

    const json = await res.json();
    console.log('✅ Webhook Accepted:', json);

    // 4. Verify DB
    console.log('🔍 Verifying Database Updates...');

    // Check Status
    const deposit = await prisma.deposit.findUnique({
        where: { txHash: mockHash }
    });

    if (!deposit) {
        console.error('❌ Deposit record not found!');
        process.exit(1);
    }

    if (deposit.status !== 'PENDING_SWEEP') {
        console.error(`❌ Incorrect Status: Expected PENDING_SWEEP, got ${deposit.status}`);
        process.exit(1);
    }
    console.log('✅ Deposit Record Created with status PENDING_SWEEP');

    // Check Balance
    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    const newBalance = Number(updatedUser?.currentBalance);
    const diff = newBalance - initialBalance;

    console.log(`💰 New Balance: $${newBalance} (Diff: $${diff})`);

    // Allow small float error
    if (Math.abs(diff - expectedCredit) < 0.0001) {
        console.log('✅ Balance Credited Correctly (Amount - 1% Fee)');
    } else {
        console.error(`❌ Balance Mismatch! Expected increase of ${expectedCredit}, got ${diff}`);
        process.exit(1);
    }

    console.log('🎉 Verification Successful!');
}

main().catch(console.error);
