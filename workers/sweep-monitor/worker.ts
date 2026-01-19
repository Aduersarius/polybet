/**
 * Production-Grade Sweep Monitor Worker
 * 
 * Database-driven sweep system with:
 * - Retry logic with exponential backoff
 * - Health monitoring
 * - Structured logging
 * - Error alerting
 * - Graceful degradation
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import Pusher from 'pusher';
import fs from 'fs';
import path from 'path';

// Environment validation
const requiredEnvVars = [
    'DATABASE_URL',
    'POLYGON_PROVIDER_URL',
    'CRYPTO_MASTER_MNEMONIC',
    'MASTER_WALLET_ADDRESS'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error('❌ Missing required environment variable:', envVar);
        process.exit(1);
    }
}

const DATABASE_URL = process.env.DATABASE_URL!;

// Initialize Prisma with pg adapter (bulletproof pattern for Alpine/Prisma 7)
const getSSLConfig = () => {
    try {
        const caPath = path.join(process.cwd(), 'certs/db-ca.crt');
        if (fs.existsSync(caPath)) {
            return {
                ca: fs.readFileSync(caPath, 'utf8'),
                rejectUnauthorized: true,
            };
        }
    } catch (err) {
        console.warn('[Worker] Failed to read CA certificate:', err);
    }
    return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : { rejectUnauthorized: false }; // nosemgrep
};

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: getSSLConfig(),
    max: 5,
});

const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
});

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
const CHECK_INTERVAL_MS = parseInt(process.env.SWEEP_CHECK_INTERVAL_MS || '30000');
const MAX_RETRIES = parseInt(process.env.SWEEP_MAX_RETRIES || '3');
const RETRY_DELAY_MS = parseInt(process.env.SWEEP_RETRY_DELAY_MS || '5000');

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const masterNode = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, 'm');

// Initialize Pusher (Soketi)
const pusher = new Pusher({
    appId: process.env.SOKETI_DEFAULT_APP_ID || 'pariflow',
    key: process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key',
    secret: process.env.SOKETI_DEFAULT_APP_SECRET || 'pariflow_secret',
    host: process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.pariflow.com',
    port: process.env.NEXT_PUBLIC_SOKETI_PORT || '443',
    useTLS: process.env.NEXT_PUBLIC_SOKETI_USE_TLS !== 'false',
});

async function triggerUserUpdate(userId: string, type: string, payload: any) {
    try {
        await pusher.trigger(`user-${userId}`, type, payload);
    } catch (error) {
        console.error('[Pusher] Error triggering user update for', userId, ':', error);
    }
}

// Health tracking
let lastSuccessfulCheck = Date.now();
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

interface SweepStats {
    totalAttempts: number;
    successfulSweeps: number;
    failedSweeps: number;
    lastSweepTime: Date | null;
}

const stats: SweepStats = {
    totalAttempts: 0,
    successfulSweeps: 0,
    failedSweeps: 0,
    lastSweepTime: null
};

/**
 * Structured logger
 */
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, metadata?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        service: 'sweep-monitor',
        message,
        ...metadata
    };

    console.log(JSON.stringify(logEntry));
}

/**
 * Get token contract address from deposit currency
 */
function getTokenAddress(currency: string): string {
    if (currency === 'USDC') return USDC_NATIVE_ADDRESS;
    if (currency === 'USDC.e') return USDC_BRIDGED_ADDRESS;
    return USDC_NATIVE_ADDRESS; // Default
}

/**
 * Check for deposits that need sweeping
 * Database-driven approach - no wasteful blockchain calls
 */
async function checkPendingSweeps() {
    log('INFO', 'Checking for pending sweeps...');

    try {
        // Find deposits that need sweeping
        const pendingDeposits = await prisma.deposit.findMany({
            where: {
                status: 'PENDING_SWEEP',
                OR: [
                    { retryCount: { lt: MAX_RETRIES } },
                    { retryCount: null }
                ]
            },
            include: {
                user: {
                    include: {
                        depositAddresses: {
                            where: { currency: 'USDC' }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' },
            take: 10 // Process in batches
        });

        if (pendingDeposits.length === 0) {
            log('INFO', 'No pending sweeps found');
            lastSuccessfulCheck = Date.now();
            consecutiveFailures = 0;
            return;
        }

        log('INFO', `Found ${pendingDeposits.length} deposits to sweep`, {
            count: pendingDeposits.length
        });

        // Process each deposit
        for (const deposit of pendingDeposits) {
            await sweepDeposit(deposit);

            // Small delay between sweeps to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        lastSuccessfulCheck = Date.now();
        consecutiveFailures = 0;

    } catch (error: any) {
        consecutiveFailures++;
        log('ERROR', 'Failed to check pending sweeps', {
            error: error.message,
            consecutiveFailures
        });

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            log('ERROR', '🚨 CRITICAL: Multiple consecutive failures - manual intervention required', {
                consecutiveFailures
            });
        }
    }
}

/**
 * Sweep a single deposit with retry logic
 */
async function sweepDeposit(deposit: any) {
    const depositAddress = deposit.user.depositAddresses[0];

    if (!depositAddress) {
        log('ERROR', 'No deposit address found for user', {
            depositId: deposit.id,
            userId: deposit.userId
        });
        return;
    }

    stats.totalAttempts++;
    const retryCount = deposit.retryCount || 0;
    const retryDelay = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff

    log('INFO', `Sweeping deposit ${deposit.id}`, {
        depositId: deposit.id,
        amount: deposit.amount,
        currency: deposit.currency,
        retryCount,
        retryDelay
    });

    try {
        // Derive wallet
        const path = `m/44'/60'/0'/0/${depositAddress.derivationIndex}`;
        const userWallet = masterNode.derivePath(path).connect(provider);
        const masterWallet = masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(provider);

        // Get token contract
        const tokenAddress = getTokenAddress(deposit.currency);
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, userWallet);

        // Check actual balance on-chain
        const balance = await tokenContract.balanceOf(depositAddress.address);

        if (balance === 0n) {
            log('WARN', 'Balance is 0 - marking as completed (already swept or invalid)', {
                depositId: deposit.id
            });

            await prisma.deposit.update({
                where: { id: deposit.id },
                data: {
                    status: 'COMPLETED',
                    updatedAt: new Date()
                }
            });
            return;
        }

        // Check if wallet needs gas
        const maticBalance = await provider.getBalance(depositAddress.address);
        const feeData = await provider.getFeeData();
        const gasLimit = 100000n;
        const gasPrice = (feeData.gasPrice! * 150n) / 100n; // 1.5x Multiplier
        const requiredMatic = gasLimit * gasPrice;

        if (maticBalance < requiredMatic) {
            log('INFO', 'Topping up gas', {
                depositId: deposit.id,
                address: depositAddress.address,
                required: ethers.formatEther(requiredMatic)
            });

            const topupTx = await masterWallet.sendTransaction({
                to: depositAddress.address,
                value: requiredMatic * 2n,
                gasPrice: gasPrice
            });

            await Promise.race([
                topupTx.wait(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Topup timeout')), 30000))
            ]);

            log('INFO', 'Gas topped up', {
                depositId: deposit.id,
                txHash: topupTx.hash
            });
        }

        // Sweep tokens
        log('INFO', 'Executing sweep transaction', {
            depositId: deposit.id,
            amount: ethers.formatUnits(balance, 6),
            currency: deposit.currency
        });

        const sweepTx = await tokenContract.transfer(MASTER_WALLET_ADDRESS, balance, {
            gasPrice: gasPrice
        });

        await Promise.race([
            sweepTx.wait(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Sweep timeout')), 30000))
        ]);

        log('INFO', '✅ Sweep completed successfully', {
            depositId: deposit.id,
            txHash: sweepTx.hash,
            amount: ethers.formatUnits(balance, 6)
        });

        // Update deposit status AND Credit Balance (Atomic Transaction)
        const rawAmount = parseFloat(ethers.formatUnits(balance, 6));
        const fee = rawAmount * 0.01; // 1% Fee (matching sweepChainDeposit logic)
        const finalAmount = rawAmount - fee;

        await prisma.$transaction(async (txPrisma) => {
            // 1. Mark Deposit Completed
            await txPrisma.deposit.update({
                where: { id: deposit.id },
                data: {
                    status: 'COMPLETED',
                    txHash: sweepTx.hash,
                    updatedAt: new Date()
                }
            });

            // 2. Credit User Balance
            const userBalance = await txPrisma.balance.findFirst({
                where: { userId: depositAddress.userId, tokenSymbol: 'TUSD', eventId: null }
            });

            if (userBalance) {
                await txPrisma.balance.update({
                    where: { id: userBalance.id },
                    data: { amount: { increment: finalAmount } }
                });
            } else {
                await txPrisma.balance.create({
                    data: {
                        userId: depositAddress.userId,
                        tokenSymbol: 'TUSD',
                        amount: finalAmount,
                        locked: 0
                    }
                });
            }
        });

        log('INFO', `✅ User ${depositAddress.userId} credited with $${finalAmount}`);

        // Publish via Pusher (Soketi) for Frontend
        await triggerUserUpdate(depositAddress.userId, 'transaction-update', {
            id: deposit.id,
            status: 'COMPLETED',
            txHash: sweepTx.hash,
            updatedAt: new Date().toISOString()
        });

        stats.successfulSweeps++;
        stats.lastSweepTime = new Date();

    } catch (error: any) {
        stats.failedSweeps++;

        log('ERROR', 'Sweep failed', {
            depositId: deposit.id,
            retryCount,
            error: error.message,
            code: error.code
        });

        // Update retry count
        const newRetryCount = retryCount + 1;

        if (newRetryCount >= MAX_RETRIES) {
            log('ERROR', '🚨 Sweep failed after max retries - manual intervention required', {
                depositId: deposit.id,
                retryCount: newRetryCount,
                maxRetries: MAX_RETRIES
            });

            await prisma.deposit.update({
                where: { id: deposit.id },
                data: {
                    status: 'FAILED',
                    retryCount: newRetryCount,
                    metadata: {
                        ...(deposit.metadata || {}),
                        lastError: error.message,
                        lastErrorTime: new Date().toISOString()
                    },
                    updatedAt: new Date()
                }
            });
        } else {
            // Schedule retry
            // Publish via Pusher (Soketi) for Frontend
            await triggerUserUpdate(depositAddress.userId, 'transaction-update', {
                id: deposit.id,
                status: 'PENDING_SWEEP',
                retryCount: newRetryCount,
                lastError: error.message,
                nextRetry: new Date(Date.now() + retryDelay).toISOString()
            });

            await prisma.deposit.update({
                where: { id: deposit.id },
                data: {
                    retryCount: newRetryCount,
                    metadata: {
                        ...(deposit.metadata || {}),
                        lastError: error.message,
                        lastErrorTime: new Date().toISOString(),
                        nextRetry: new Date(Date.now() + retryDelay).toISOString()
                    },
                    updatedAt: new Date()
                }
            });

            log('INFO', `Scheduled retry for deposit ${deposit.id}`, {
                depositId: deposit.id,
                nextRetry: newRetryCount,
                delayMs: retryDelay
            });
        }
    }
}

/**
 * Health check for monitoring
 */
function getHealthStatus() {
    const timeSinceLastCheck = Date.now() - lastSuccessfulCheck;
    const isHealthy = timeSinceLastCheck < CHECK_INTERVAL_MS * 3 && consecutiveFailures < MAX_CONSECUTIVE_FAILURES;

    return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        lastSuccessfulCheck: new Date(lastSuccessfulCheck).toISOString(),
        timeSinceLastCheck,
        consecutiveFailures,
        stats: {
            ...stats,
            lastSweepTime: stats.lastSweepTime?.toISOString() || null
        }
    };
}

/**
 * Check for actual on-chain balances (Polling Mode)
 * This handles cases where webhooks miss or aren't used.
 */
async function checkChainDeposits() {
    log('INFO', '🔍 Scanning blockchain for deposits...');

    try {
        // 1. Pagination Loop to check ALL addresses
        let skip = 0;
        const BATCH_SIZE = 50;
        let totalScanned = 0;

        while (true) {
            const depositAddresses = await prisma.depositAddress.findMany({
                where: { currency: 'USDC' },
                orderBy: { userId: 'asc' }, // Ensure stable pagination
                take: BATCH_SIZE,
                skip: skip
            });

            if (depositAddresses.length === 0) break;

            // 2. Scan Batch
            const promises = depositAddresses.map(async (addr) => {
                try {
                    const tokenContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, provider);
                    const balance = await tokenContract.balanceOf(addr.address);
                    const minDeposit = ethers.parseUnits('0.5', 6);

                    if (balance > minDeposit) {
                        log('INFO', '💰 FOUND DEPOSIT ON CHAIN!', {
                            address: addr.address,
                            balance: ethers.formatUnits(balance, 6),
                            userId: addr.userId
                        });
                        await sweepChainDeposit(addr, balance);
                    }
                } catch (err) {
                    console.error(`Failed to scan address ${addr.address}`, err);
                }
            });

            // Run batch in parallel
            await Promise.all(promises);

            totalScanned += depositAddresses.length;
            skip += BATCH_SIZE;

            // Small delay to be nice to RPC
            await new Promise(r => setTimeout(r, 100));
        }

        if (totalScanned > 0) {
            log('INFO', `Scanned ${totalScanned} addresses.`);
        } else {
            // Silence this log to avoid noise if 0 addresses
            // log('INFO', 'No deposit addresses to scan');
        }

    } catch (error: any) {
        log('ERROR', 'Failed to scan chain deposits', { error: error.message });
    }
}

async function sweepChainDeposit(depositAddress: any, balance: bigint) {
    try {
        log('INFO', `⚡ Initiating sweep for detected funds`, {
            address: depositAddress.address,
            amount: ethers.formatUnits(balance, 6)
        });

        const path = `m/44'/60'/0'/0/${depositAddress.derivationIndex}`;
        const userWallet = masterNode.derivePath(path).connect(provider);

        // Gas check logic...
        const maticBalance = await provider.getBalance(depositAddress.address);
        const feeData = await provider.getFeeData();

        // Use a multiplier for Polygon to avoid stuck transactions
        const gasPrice = (feeData.gasPrice! * 150n) / 100n; // 1.5x Multiplier
        const gasLimit = 100000n;
        const requiredMatic = gasLimit * gasPrice;

        if (maticBalance < requiredMatic) {
            log('INFO', 'Needs gas top-up', { address: depositAddress.address });
            const masterWallet = masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(provider);

            const topup = await masterWallet.sendTransaction({
                to: depositAddress.address,
                value: requiredMatic * 2n, // Send a bit extra for safety
                gasPrice: gasPrice
            });

            // Wait with a timeout
            await Promise.race([
                topup.wait(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Topup timeout')), 30000))
            ]);

            log('INFO', 'Gas topped up');
        }

        // Sweep
        const sweepGasPrice = (feeData.gasPrice! * 150n) / 100n;
        const tokenContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, userWallet);
        const tx = await tokenContract.transfer(MASTER_WALLET_ADDRESS, balance, {
            gasPrice: sweepGasPrice
        });

        await Promise.race([
            tx.wait(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Sweep timeout')), 30000))
        ]);

        log('INFO', `✅ ON-CHAIN SWEEP SUCCESS: ${tx.hash}`);

        // Credit User in DB
        const rawAmount = parseFloat(ethers.formatUnits(balance, 6));
        const fee = rawAmount * 0.01; // 1%
        const finalAmount = rawAmount - fee;

        await prisma.$transaction(async (txPrisma) => {
            // Create Deposit Record
            await txPrisma.deposit.create({
                data: {
                    userId: depositAddress.userId,
                    amount: finalAmount,
                    currency: 'USDC',
                    txHash: tx.hash,
                    status: 'COMPLETED',
                    fromAddress: depositAddress.address,
                    toAddress: MASTER_WALLET_ADDRESS
                }
            });

            // Credit Balance (simplified version of crypto-service logic)
            // Check if Balance row exists...
            const userBalance = await txPrisma.balance.findFirst({
                where: { userId: depositAddress.userId, tokenSymbol: 'TUSD', eventId: null }
            });

            if (userBalance) {
                await txPrisma.balance.update({
                    where: { id: userBalance.id },
                    data: { amount: { increment: finalAmount } }
                });
            } else {
                await txPrisma.balance.create({
                    data: {
                        userId: depositAddress.userId,
                        tokenSymbol: 'TUSD',
                        amount: finalAmount,
                        locked: 0
                    }
                });
            }
        });

        log('INFO', `✅ User ${depositAddress.userId} credited with $${finalAmount}`);

        // Notify via Pusher
        await triggerUserUpdate(depositAddress.userId, 'user-update', {
            type: 'DEPOSIT_SUCCESS',
            payload: { message: `Deposit of $${finalAmount} confirmed!` }
        });

    } catch (e: any) {
        log('ERROR', 'Chain sweep failed', { error: e.message });
    }
}

/**
 * Main worker loop
 */
async function main() {
    // Configuration
    const FAST_INTERVAL_MS = CHECK_INTERVAL_MS; // 10s (Webhooks/DB Pending)
    const SLOW_INTERVAL_MS = 5 * 60 * 1000;     // 5m (Blockchain Polling/Catch-all)

    log('INFO', '🚀 Sweep Monitor Worker Starting (Production Mode)...', {
        fastInterval: FAST_INTERVAL_MS,
        slowInterval: SLOW_INTERVAL_MS,
        maxRetries: MAX_RETRIES,
        masterWallet: MASTER_WALLET_ADDRESS
    });

    // Run initial checks immediately
    await checkPendingSweeps();
    checkChainDeposits(); // Run async without awaiting to not block start

    // 1. Fast Loop (DB Pending)
    setInterval(async () => {
        await checkPendingSweeps();
    }, FAST_INTERVAL_MS);

    // 2. Slow Loop (Blockchain Polling)
    setInterval(async () => {
        await checkChainDeposits();
    }, SLOW_INTERVAL_MS);

    // 3. Health Check
    setInterval(() => {
        const health = getHealthStatus();
        log('INFO', 'Health check', health);
    }, 60000); //  Every minute

    log('INFO', '✅ Worker running with Dual-Loop Strategy');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    log('INFO', '🛑 SIGTERM received, shutting down gracefully...');
    const health = getHealthStatus();
    log('INFO', 'Final health status', health);
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    log('INFO', '🛑 SIGINT received, shutting down gracefully...');
    const health = getHealthStatus();
    log('INFO', 'Final health status', health);
    await prisma.$disconnect();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    log('ERROR', '🚨 Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
    log('ERROR', '🚨 Unhandled rejection', {
        reason: reason?.message || reason
    });
});

main().catch(async (error) => {
    log('ERROR', '❌ Fatal error', {
        error: error.message,
        stack: error.stack
    });
    await prisma.$disconnect();
    process.exit(1);
});
