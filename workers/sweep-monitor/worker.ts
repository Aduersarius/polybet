/**
 * Sweep Monitor Worker
 * 
 * Monitors deposit addresses for USDC and USDC.e balances,
 * automatically sweeps funds to master wallet and credits users.
 */

import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

// Environment validation
const requiredEnvVars = [
    'DATABASE_URL',
    'POLYGON_PROVIDER_URL',
    'CRYPTO_MASTER_MNEMONIC',
    'MASTER_WALLET_ADDRESS'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const prisma = new PrismaClient();

// USDC tokens on Polygon
const USDC_NATIVE_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC
const USDC_BRIDGED_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged)

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];

const PROVIDER_URL = process.env.POLYGON_PROVIDER_URL!;
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS!;
const MNEMONIC = process.env.CRYPTO_MASTER_MNEMONIC!;
const CHECK_INTERVAL_MS = parseInt(process.env.SWEEP_CHECK_INTERVAL_MS || '60000');

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const masterNode = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, 'm');

async function checkAndSweep() {
    console.log(`[${new Date().toISOString()}] 🔍 Checking deposit addresses...`);

    try {
        // Get all USDC deposit addresses
        const addresses = await prisma.depositAddress.findMany({
            where: { currency: 'USDC' },
            select: {
                address: true,
                derivationIndex: true,
                userId: true
            }
        });

        console.log(`   Found ${addresses.length} deposit addresses to check`);

        // Check both token types
        const usdcNative = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, provider);
        const usdcBridged = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);

        const minDeposit = ethers.parseUnits('0.5', 6); // 0.5 USDC minimum

        for (const addr of addresses) {
            // Check both tokens in parallel
            const [nativeBalance, bridgedBalance] = await Promise.all([
                usdcNative.balanceOf(addr.address).catch(() => 0n),
                usdcBridged.balanceOf(addr.address).catch(() => 0n)
            ]);

            // Sweep native USDC if found
            if (nativeBalance > minDeposit) {
                console.log(`   💰 Found ${ethers.formatUnits(nativeBalance, 6)} USDC at ${addr.address}`);
                await sweep(addr, nativeBalance, USDC_NATIVE_ADDRESS, 'USDC');
            }

            // Sweep bridged USDC.e if found
            if (bridgedBalance > minDeposit) {
                console.log(`   💰 Found ${ethers.formatUnits(bridgedBalance, 6)} USDC.e at ${addr.address}`);
                await sweep(addr, bridgedBalance, USDC_BRIDGED_ADDRESS, 'USDC.e');
            }
        }

        console.log(`   ✅ Check complete`);
    } catch (error) {
        console.error('   ❌ Error during check:', error);
    }
}

async function sweep(
    addr: { address: string; derivationIndex: number; userId: string },
    balance: bigint,
    tokenAddress: string,
    symbol: string
) {
    try {
        // Derive wallet
        const path = `m/44'/60'/0'/0/${addr.derivationIndex}`;
        const userWallet = masterNode.derivePath(path).connect(provider);
        const masterWallet = masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(provider);

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, userWallet);

        // Check if wallet needs gas
        const maticBalance = await provider.getBalance(addr.address);
        const feeData = await provider.getFeeData();
        const gasLimit = 100000n;
        const gasPrice = feeData.gasPrice || ethers.parseUnits('30', 'gwei');
        const requiredMatic = gasLimit * gasPrice * 2n; // 2x buffer

        if (maticBalance < requiredMatic) {
            console.log(`      ⛽ Topping up gas for ${addr.address}...`);
            const topupTx = await masterWallet.sendTransaction({
                to: addr.address,
                value: requiredMatic - maticBalance,
                gasLimit: 21000n
            });
            await topupTx.wait();
            console.log(`      ✅ Gas topped up`);
        }

        // Sweep tokens
        console.log(`      🧹 Sweeping ${ethers.formatUnits(balance, 6)} ${symbol}...`);
        const sweepTx = await tokenContract.transfer(MASTER_WALLET_ADDRESS, balance);
        console.log(`      📤 TX: ${sweepTx.hash}`);
        await sweepTx.wait();
        console.log(`      ✅ Sweep confirmed`);

        // Credit user
        const rawAmount = parseFloat(ethers.formatUnits(balance, 6));
        const fee = rawAmount * 0.01; // 1% fee
        const creditAmount = rawAmount - fee;

        await prisma.$transaction(async (tx) => {
            // Create deposit record
            await tx.deposit.create({
                data: {
                    userId: addr.userId,
                    amount: creditAmount,
                    currency: symbol,
                    txHash: sweepTx.hash,
                    status: 'COMPLETED',
                    fromAddress: addr.address,
                    toAddress: MASTER_WALLET_ADDRESS
                }
            });

            // Update balance
            const userBalance = await tx.balance.findFirst({
                where: {
                    userId: addr.userId,
                    tokenSymbol: 'TUSD',
                    eventId: null,
                    outcomeId: null
                }
            });

            if (userBalance) {
                await tx.balance.update({
                    where: { id: userBalance.id },
                    data: { amount: { increment: creditAmount } }
                });
            } else {
                await tx.balance.create({
                    data: {
                        userId: addr.userId,
                        tokenSymbol: 'TUSD',
                        amount: creditAmount
                    }
                });
            }
        });

        console.log(`      💵 Credited $${creditAmount.toFixed(2)} to user ${addr.userId}`);
    } catch (error) {
        console.error(`      ❌ Sweep failed for ${addr.address}:`, error);
    }
}

async function main() {
    console.log('🚀 Sweep Monitor Worker Starting...');
    console.log(`   Check interval: ${CHECK_INTERVAL_MS}ms`);
    console.log(`   Master wallet: ${MASTER_WALLET_ADDRESS}`);
    console.log(`   Monitoring: USDC + USDC.e`);

    // Run initial check
    await checkAndSweep();

    // Schedule periodic checks
    setInterval(async () => {
        await checkAndSweep();
    }, CHECK_INTERVAL_MS);

    console.log('✅ Worker running');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

main().catch(async (error) => {
    console.error('❌ Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
});
