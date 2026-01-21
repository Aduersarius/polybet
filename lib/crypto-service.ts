import { Prisma } from '@prisma/client';
import { ethers } from 'ethers';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { updateReferralStats } from '@/lib/affiliate-tracking';
import { redis } from '@/lib/redis';

const DEPOSIT_ADDRESS_SELECT = {
    address: true,
    derivationIndex: true,
    userId: true,
} as const;

type DepositAddressLite = Prisma.DepositAddressGetPayload<{ select: typeof DEPOSIT_ADDRESS_SELECT }>;

// Polygon RPC (e.g., https://polygon-rpc.com or Alchemy/Infura)
const PROVIDER_URL = process.env.POLYGON_PROVIDER_URL || 'https://polygon-rpc.com';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS;

// USDC tokens on Polygon - we support both native and bridged
const USDC_NATIVE_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC (new)
const USDC_BRIDGED_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged from Ethereum)

// Use native USDC as default for withdrawals
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || USDC_NATIVE_ADDRESS;

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

export class CryptoService {
    private provider: ethers.JsonRpcProvider;
    private depositNode: ethers.HDNodeWallet;
    private hotNode: ethers.HDNodeWallet;
    private verbose: boolean;

    private log(...args: any[]) {
        if (this.verbose) console.log(...args);
    }

    private warn(...args: any[]) {
        if (this.verbose) console.warn(...args);
    }

    // Centralized ledger writer inside existing transactions
    private async recordLedger(tx: any, params: {
        userId: string,
        direction: 'CREDIT' | 'DEBIT',
        amount: number,
        currency: string,
        balanceBefore: number,
        balanceAfter: number,
        referenceType?: string,
        referenceId?: string,
        metadata?: any
    }) {
        try {
            await tx.ledgerEntry.create({
                data: {
                    userId: params.userId,
                    direction: params.direction,
                    amount: params.amount,
                    currency: params.currency,
                    balanceBefore: params.balanceBefore,
                    balanceAfter: params.balanceAfter,
                    referenceType: params.referenceType,
                    referenceId: params.referenceId,
                    metadata: params.metadata ?? {}
                }
            });
        } catch (e: any) {
            // If LedgerEntry table is missing (older schema), skip ledger write but do not fail the deposit.
            if (e?.code === 'P2021') {
                console.warn('[LEDGER] LedgerEntry table missing, skipping ledger entry');
                return;
            }
            throw e;
        }
    }

    private validateWithdrawalStatusTransition(currentStatus: string, newStatus: string) {
        const validTransitions: Record<string, string[]> = {
            'PENDING': ['APPROVED', 'REJECTED'],
            'APPROVED': ['COMPLETED', 'FAILED'],
            'REJECTED': [],
            'COMPLETED': [],
            'FAILED': []
        };

        if (!validTransitions[currentStatus]?.includes(newStatus)) {
            throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
        }
    }

    constructor(depositMnemonic: string, hotMnemonic?: string) {
        this.provider = new ethers.JsonRpcProvider(PROVIDER_URL);
        // Initialize with root path "m" to avoid derivation errors
        this.depositNode = ethers.HDNodeWallet.fromPhrase(depositMnemonic, undefined, "m");
        this.hotNode = ethers.HDNodeWallet.fromPhrase(hotMnemonic ?? depositMnemonic, undefined, "m");
        this.verbose = process.env.NODE_ENV !== 'production';

        const hotWallet = this.hotNode.derivePath(`m/44'/60'/0'/0/0`);
        if (MASTER_WALLET_ADDRESS && hotWallet.address.toLowerCase() !== MASTER_WALLET_ADDRESS.toLowerCase()) {
            throw new Error('MASTER_WALLET_ADDRESS must match the hot wallet derived from CRYPTO_WITHDRAW_MNEMONIC/CRYPTO_MASTER_MNEMONIC');
        }
    }

    async getDepositAddress(userId: string, currency: string = 'USDC'): Promise<string> {
        const existing = await prisma.depositAddress.findUnique({
            where: {
                userId_currency: {
                    userId,
                    currency,
                },
            },
        });

        if (existing) {
            return existing.address;
        }

        const count = await prisma.depositAddress.count({
            where: { currency },
        });

        // Start from index 1 to reserve 0 for hot wallet
        const index = count + 1;

        // BIP44 path: m / purpose' / coin_type' / account' / change / address_index
        // ETH/Polygon: m/44'/60'/0'/0/index
        const path = `m/44'/60'/0'/0/${index}`;
        const wallet = this.depositNode.derivePath(path);
        const address = wallet.address;

        await prisma.depositAddress.create({
            data: {
                userId,
                currency,
                address,
                derivationIndex: index,
            },
        });

        return address;
    }

    async checkDeposits() {
        this.log('Checking deposits...');
        const addresses: DepositAddressLite[] = await prisma.depositAddress.findMany({
            where: { currency: 'USDC' },
            select: DEPOSIT_ADDRESS_SELECT,
        });

        // Check both USDC tokens
        const usdcNativeContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, this.provider);
        const usdcBridgedContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, this.provider);

        // Check balances for both tokens in parallel
        const balancePromises = addresses.flatMap((addr: DepositAddressLite) => [
            // Check native USDC
            (async () => {
                try {
                    const balance = await usdcNativeContract.balanceOf(addr.address);
                    return { addr, balance, tokenAddress: USDC_NATIVE_ADDRESS, symbol: 'USDC' };
                } catch (error) {
                    console.error('Error checking USDC balance for', addr.address, ':', error);
                    return { addr, balance: 0n, tokenAddress: USDC_NATIVE_ADDRESS, symbol: 'USDC' };
                }
            })(),
            // Check bridged USDC.e
            (async () => {
                try {
                    const balance = await usdcBridgedContract.balanceOf(addr.address);
                    return { addr, balance, tokenAddress: USDC_BRIDGED_ADDRESS, symbol: 'USDC.e' };
                } catch (error) {
                    console.error('Error checking USDC.e balance for', addr.address, ':', error);
                    return { addr, balance: 0n, tokenAddress: USDC_BRIDGED_ADDRESS, symbol: 'USDC.e' };
                }
            })()
        ]);

        const balanceResults = await Promise.all(balancePromises);

        // Process deposits sequentially to avoid database conflicts
        for (const { addr, balance, tokenAddress, symbol } of balanceResults) {
            // Minimum deposit amount (e.g., 0.5 USDC)
            const minDeposit = ethers.parseUnits('0.5', 6); // USDC has 6 decimals

            if (balance > minDeposit) {
                this.log('Found balance', ethers.formatUnits(balance, 6), symbol, 'at', addr.address);
                try {
                    await this.sweepAndCredit(addr, balance, { tokenAddress });
                } catch (error) {
                    console.error('Error sweeping and crediting', symbol, 'from', addr.address, ':', error);
                }
            }
        }
    }

    public async sweepAndCredit(addr: DepositAddressLite, tokenBalance: bigint, options: { sweepOnly?: boolean; depositId?: string; tokenAddress?: string } = {}) {
        if (!MASTER_WALLET_ADDRESS) {
            console.error('MASTER_WALLET_ADDRESS not set');
            return;
        }

        const path = `m/44'/60'/0'/0/${addr.derivationIndex}`;
        const userWallet = this.depositNode.derivePath(path).connect(this.provider);
        const masterWallet = this.hotNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);

        // Use the specified token address or default to USDC_ADDRESS
        const tokenAddress = options.tokenAddress || USDC_ADDRESS;
        const usdcContract = new ethers.Contract(tokenAddress, ERC20_ABI, userWallet);

        // 1. Check MATIC balance for gas and get fee data in parallel
        let maticBalance: bigint;
        let feeData: ethers.FeeData;
        try {
            [maticBalance, feeData] = await Promise.all([
                this.provider.getBalance(addr.address),
                this.provider.getFeeData()
            ]);
        } catch (error) {
            console.error('Error fetching balance and fee data for', addr.address, ':', error);
            return; // Skip this address
        }

        // Estimate gas for transfer
        // Standard ERC20 transfer is ~65,000 gas
        const gasLimit = BigInt(100000);
        const gasPrice = feeData.gasPrice || ethers.parseUnits('30', 'gwei');
        const gasCost = gasLimit * gasPrice;

        // Add a buffer (2x) to be safe
        const requiredMatic = gasCost * BigInt(2);

        if (maticBalance < requiredMatic) {
            this.log('Top-up needed for', addr.address, '. Has', ethers.formatEther(maticBalance), ', needs', ethers.formatEther(requiredMatic));

            // Send MATIC from Master
            try {
                const tx = await masterWallet.sendTransaction({
                    to: addr.address,
                    value: requiredMatic - maticBalance, // Top up difference
                    gasLimit: BigInt(21000)
                });
                await tx.wait();
                this.log('Topped up gas. Hash:', tx.hash);
            } catch (e) {
                console.error('Failed to top up gas:', e);
                return;
            }
        }

        // 2. Sweep Tokens
        try {
            this.log('[DEPOSIT] Starting token sweep for user', addr.userId, ', address', addr.address, ', balance:', ethers.formatUnits(tokenBalance, 6), 'USDC');
            const tx = await usdcContract.transfer(MASTER_WALLET_ADDRESS, tokenBalance);
            this.log('[DEPOSIT] Sweep transaction sent. Hash:', tx.hash);
            await tx.wait();
            this.log('[DEPOSIT] Sweep transaction confirmed for', addr.address);

            // 3. Credit User
            // USDC is pegged to USD. We take a 1% fee for conversion/service.
            const rawUsdAmount = parseFloat(ethers.formatUnits(tokenBalance, 6));
            const fee = rawUsdAmount * 0.01; // 1% fee
            const usdAmount = rawUsdAmount - fee;

            this.log('[DEPOSIT] Processing deposit: raw', rawUsdAmount, 'USDC, fee', fee, ', crediting', usdAmount, 'USD');

            let dbTransactionSuccess = false;
            try {
                await prisma.$transaction(async (txPrisma: Prisma.TransactionClient) => {
                    if (options.sweepOnly && options.depositId) {
                        // SWEEP ONLY MODE (Webhook already credited user)
                        // Just update the status of the existing deposit
                        await txPrisma.deposit.update({
                            where: { id: options.depositId },
                            data: {
                                status: 'COMPLETED',
                                toAddress: MASTER_WALLET_ADDRESS, // Update destination now that we swept
                                updatedAt: new Date()
                            }
                        });
                        this.log('[DEPOSIT] Sweep-only mode: Updated deposit', options.depositId, 'to COMPLETED');
                    } else {
                        // LEGACY / POLLING MODE
                        // Create record and credit user
                        // Create Deposit Record
                        await txPrisma.deposit.create({
                            data: {
                                userId: addr.userId,
                                amount: usdAmount,
                                currency: 'USDC',
                                txHash: tx.hash,
                                status: 'COMPLETED',
                                fromAddress: addr.address,
                                toAddress: MASTER_WALLET_ADDRESS,
                            },
                        });

                        // Update User Balance with row-level locking
                        // Some databases might not have the "locked" column (older schema).
                        const lockedColResult = await txPrisma.$queryRaw<Array<{ exists: boolean }>>`
                            SELECT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_schema = 'public' AND table_name = 'Balance' AND column_name = 'locked'
                            ) AS "exists"
                        `;
                        const hasLockedColumn = Boolean(lockedColResult?.[0]?.exists);

                        const balances = hasLockedColumn
                            ? await txPrisma.$queryRaw<Array<{ id: string, amount: any, locked: any }>>`
                                SELECT "id", "amount", "locked" FROM "Balance"
                                WHERE "userId" = ${addr.userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
                                FOR UPDATE
                            `
                            : await txPrisma.$queryRaw<Array<{ id: string, amount: any }>>`
                                SELECT "id", "amount" FROM "Balance"
                                WHERE "userId" = ${addr.userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
                                FOR UPDATE
                            `;

                        let balanceId: string;
                        let before = 0;
                        if (balances.length > 0) {
                            balanceId = balances[0].id;
                            before = Number((balances[0] as any).amount);

                            if (hasLockedColumn) {
                                await txPrisma.balance.update({
                                    where: { id: balanceId },
                                    data: { amount: { increment: usdAmount } }
                                });
                            } else {
                                await txPrisma.$executeRaw`
                                    UPDATE "Balance"
                                    SET "amount" = "amount" + ${usdAmount}, "updatedAt" = NOW()
                                    WHERE "id" = ${balanceId}
                                `;
                            }
                        } else {
                            before = 0;
                            if (hasLockedColumn) {
                                const created = await txPrisma.balance.create({
                                    data: {
                                        userId: addr.userId,
                                        tokenSymbol: 'TUSD',
                                        amount: usdAmount,
                                        locked: 0
                                    }
                                });
                                balanceId = created.id;
                            } else {
                                balanceId = randomUUID();
                                await txPrisma.$executeRaw`
                                    INSERT INTO "Balance" ("id", "userId", "tokenSymbol", "eventId", "outcomeId", "amount", "updatedAt")
                                    VALUES (${balanceId}, ${addr.userId}, 'TUSD', NULL, NULL, ${usdAmount}, NOW())
                                `;
                            }
                        }

                        const after = before + usdAmount;

                        await this.recordLedger(txPrisma, {
                            userId: addr.userId,
                            direction: 'CREDIT',
                            amount: usdAmount,
                            currency: 'TUSD',
                            balanceBefore: before,
                            balanceAfter: after,
                            referenceType: 'DEPOSIT',
                            referenceId: tx.hash,
                            metadata: { fromAddress: addr.address }
                        });
                    }
                });
                dbTransactionSuccess = true;
                this.log('[DEPOSIT] Successfully credited user', addr.userId, 'with $', usdAmount);
            } catch (dbError) {
                console.error('[DEPOSIT] Database transaction failed for user', addr.userId, ', attempting rollback:', dbError);

                // Rollback: Refund tokens back to user wallet
                try {
                    const masterWallet = this.hotNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);
                    const refundContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, masterWallet);
                    const refundTx = await refundContract.transfer(addr.address, tokenBalance);
                    this.log('[DEPOSIT] Refund transaction sent. Hash:', refundTx.hash);
                    await refundTx.wait();
                    this.log('[DEPOSIT] Successfully refunded', ethers.formatUnits(tokenBalance, 6), 'USDC to', addr.address);
                } catch (refundError) {
                    console.error('[DEPOSIT] CRITICAL: Failed to refund tokens to', addr.address, '. Manual intervention required:', refundError);
                    // At this point, tokens are swept but user not credited and refund failed
                    // This needs manual intervention
                    throw new Error(`Deposit sweep succeeded but database failed and refund failed for address ${addr.address}`);
                }

                throw dbError; // Re-throw the original DB error
            }

        } catch (error) {
            console.error('[DEPOSIT] Failed to process deposit for', addr.address, ':', error);
        }
    }

    async requestWithdrawal(userId: string, amount: number, address: string, currency: string = 'USDC', idempotencyKey?: string): Promise<string> {
        this.log('[WITHDRAWAL] Requesting withdrawal for user', userId, ':', amount, currency, 'to', address, idempotencyKey ? ' (idempotencyKey: ' + idempotencyKey + ')' : '');

        // Check for existing idempotencyKey to prevent duplicates
        if (idempotencyKey) {
            const existingWithdrawal = await prisma.withdrawal.findUnique({
                where: { idempotencyKey }
            });
            if (existingWithdrawal) {
                throw new Error('Withdrawal request with idempotencyKey ' + idempotencyKey + ' already exists');
            }
        }

        // Detect required ledger schema
        const lockedColResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'Balance' AND column_name = 'locked'
            ) AS "exists"
        `;
        const hasLockedColumn = Boolean(lockedColResult?.[0]?.exists);

        const ledgerTableResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'LedgerEntry'
            ) AS "exists"
        `;
        const hasLedgerTable = Boolean(ledgerTableResult?.[0]?.exists);

        if (!hasLockedColumn || !hasLedgerTable) {
            throw new Error('Ledger schema missing: ensure Balance.locked and LedgerEntry table exist (run latest migrations).');
        }

        let withdrawalId: string;

        try {
            withdrawalId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // Lock the balance row for update
                const balances = await tx.$queryRaw<Array<{ id: string; amount: any; locked: any }>>`
                    SELECT "id", "amount", "locked" FROM "Balance"
                    WHERE "userId" = ${userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
                    FOR UPDATE
                `;

                if (balances.length === 0) {
                    throw new Error(`No balance found for user ${userId}`);
                }

                const available = Number(balances[0].amount);
                const locked = Number(balances[0].locked || 0);

                if (available < amount) {
                    throw new Error(`Insufficient balance: requested ${amount}, available ${available}`);
                }

                const balanceId = balances[0].id;

                const withdrawalRecord = await tx.withdrawal.create({
                    data: {
                        userId,
                        amount,
                        currency,
                        toAddress: address,
                        status: 'PENDING',
                        ...(idempotencyKey && { idempotencyKey })
                    }
                });

                await tx.balance.update({
                    where: { id: balanceId },
                    data: { amount: { decrement: amount }, locked: { increment: amount } }
                });

                await this.recordLedger(tx, {
                    userId,
                    direction: 'DEBIT',
                    amount,
                    currency: 'TUSD',
                    balanceBefore: available,
                    balanceAfter: available - amount,
                    referenceType: 'WITHDRAWAL',
                    referenceId: withdrawalRecord.id,
                    metadata: { toAddress: address }
                });

                // Return withdrawal ID from transaction
                return withdrawalRecord.id;
            });

            this.log('[WITHDRAWAL] Successfully created withdrawal request for user', userId);

            // Return withdrawal ID for notification
            return withdrawalId;
        } catch (error) {
            console.error('[WITHDRAWAL] Failed to create withdrawal request for user', userId, ':', error);
            throw error;
        }
    }

    async approveWithdrawal(withdrawalId: string, adminId: string) {
        this.log(`[WITHDRAWAL] Triggering workflow for ${withdrawalId} by admin ${adminId}`);

        // Dynamic import to avoid circular dependency
        const { processWithdrawal } = await import('@/workflows/withdrawal');

        // Trigger the workflow
        await processWithdrawal({ withdrawalId, adminId });

        this.log(`[WITHDRAWAL] Workflow triggered for ${withdrawalId}`);

        // Return queued status
        return {
            status: 'QUEUED',
            withdrawalId,
            txHash: null
        };
    }

    async validateAndApproveWithdrawal(withdrawalId: string, adminId: string) {
        const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });

        const isRetryApproved = withdrawal?.status === 'APPROVED' && !withdrawal.txHash;
        if (!withdrawal || (!isRetryApproved && withdrawal.status !== 'PENDING')) {
            throw new Error(`Invalid withdrawal request: ${withdrawalId} - status: ${withdrawal?.status || 'not found'}`);
        }
        if (withdrawal.txHash) {
            // Check if we already processed it
            return { success: true, amount: withdrawal.amount, currency: withdrawal.currency, toAddress: withdrawal.toAddress, userId: withdrawal.userId, alreadyProcessed: true };
        }

        // Limit Checks
        const maxSingle = Number(process.env.ADMIN_WITHDRAW_MAX_SINGLE ?? 50000);
        const maxDaily = Number(process.env.ADMIN_WITHDRAW_MAX_DAILY ?? 200000);

        if (Number(withdrawal.amount) > maxSingle) throw new Error(`Exceeds single cap`);

        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const dailyTotals = await prisma.withdrawal.aggregate({
            where: {
                status: { in: ['APPROVED', 'COMPLETED'] },
                approvedAt: { gte: startOfDay }
            },
            _sum: { amount: true }
        });
        const usedToday = Number(dailyTotals._sum.amount || 0);
        if (usedToday + Number(withdrawal.amount) > maxDaily) throw new Error(`Daily cap exceeded`);

        if (!isRetryApproved) {
            this.validateWithdrawalStatusTransition(withdrawal.status, 'APPROVED');
            await prisma.withdrawal.update({
                where: { id: withdrawalId },
                data: {
                    status: 'APPROVED',
                    approvedBy: adminId,
                    approvedAt: new Date()
                }
            });
        }
        return { success: true, amount: withdrawal.amount, currency: withdrawal.currency, toAddress: withdrawal.toAddress, userId: withdrawal.userId };
    }

    async broadcastWithdrawal(withdrawalId: string) {
        const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!withdrawal) throw new Error('Withdrawal not found');
        if (withdrawal.txHash) return withdrawal.txHash; // Idempotency
        if (withdrawal.status !== 'APPROVED') throw new Error('Withdrawal must be APPROVED to broadcast');

        const amountUnits = ethers.parseUnits(withdrawal.amount.toFixed(6), 6);
        const hotWallet = this.hotNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);

        // Selection Logic
        let activeUsdcAddress = USDC_ADDRESS;
        let usdcContract = new ethers.Contract(activeUsdcAddress, ERC20_ABI, hotWallet);

        // Check balance & Fallback Logic
        const balance = await usdcContract.balanceOf(hotWallet.address);
        if (balance < amountUnits) {
            const fallback = activeUsdcAddress === USDC_NATIVE_ADDRESS ? USDC_BRIDGED_ADDRESS : USDC_NATIVE_ADDRESS;
            const fallbackContract = new ethers.Contract(fallback, ERC20_ABI, hotWallet);
            if (await fallbackContract.balanceOf(hotWallet.address) >= amountUnits) {
                usdcContract = fallbackContract;
                activeUsdcAddress = fallback;
            } else {
                throw new Error(`Insufficient funds: ${ethers.formatUnits(balance, 6)}`);
            }
        }

        const tx = await usdcContract.transfer(withdrawal.toAddress, amountUnits);
        this.log(`[WITHDRAWAL] Broadcast TX ${tx.hash} for ${withdrawalId}`);
        return tx.hash;
    }

    async finalizeWithdrawal(withdrawalId: string, txHash: string, adminId: string) {
        // Wait for confirmation
        const tx = await this.provider.getTransaction(txHash);
        if (!tx) throw new Error('Transaction not found on chain');

        const receipt = await tx.wait();
        if (receipt?.status !== 1) throw new Error('Transaction failed on chain');

        // Update DB
        const withdrawal = await prisma.withdrawal.update({
            where: { id: withdrawalId },
            data: {
                status: 'COMPLETED',
                txHash: txHash,
                approvedAt: new Date(),
                approvedBy: adminId
            }
        });

        // Release Lock / Burn Locked Amount
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const balances = await tx.$queryRaw<Array<{ id: string; locked: any }>>`
                SELECT "id", "locked" FROM "Balance"
                WHERE "userId" = ${withdrawal.userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
                FOR UPDATE
            `;
            if (balances.length > 0) {
                await tx.balance.update({
                    where: { id: balances[0].id },
                    data: { locked: { decrement: withdrawal.amount } }
                });
            }
        });

        this.log(`[WITHDRAWAL] Completed withdrawal ${withdrawalId}`);
        return withdrawal;
    }
}


let cryptoServiceSingleton: CryptoService | null = null;

export function getCryptoService(): CryptoService {
    if (cryptoServiceSingleton) return cryptoServiceSingleton;
    const mnemonic = process.env.CRYPTO_MASTER_MNEMONIC;
    if (!mnemonic) {
        throw new Error('CRYPTO_MASTER_MNEMONIC environment variable is required');
    }
    const withdrawMnemonic = process.env.CRYPTO_WITHDRAW_MNEMONIC || mnemonic;
    cryptoServiceSingleton = new CryptoService(mnemonic, withdrawMnemonic);
    return cryptoServiceSingleton;
}
