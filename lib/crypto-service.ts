import { ethers } from 'ethers';
import { prisma } from '@/lib/prisma';

// Polygon RPC (e.g., https://polygon-rpc.com or Alchemy/Infura)
const PROVIDER_URL = process.env.POLYGON_PROVIDER_URL || 'https://polygon-rpc.com';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS;

// USDC on Polygon
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Mainnet USDC
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

export class CryptoService {
    private provider: ethers.JsonRpcProvider;
    private masterNode: ethers.HDNodeWallet;

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

    constructor(mnemonic: string) {
        this.provider = new ethers.JsonRpcProvider(PROVIDER_URL);
        // Initialize with root path "m" to avoid derivation errors
        this.masterNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m");
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
        const wallet = this.masterNode.derivePath(path);
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
        console.log('Checking deposits...');
        const addresses = await prisma.depositAddress.findMany({
            where: { currency: 'USDC' }
        });

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, this.provider);

        // Check balances in parallel to prevent blocking
        const balancePromises = addresses.map(async (addr) => {
            try {
                const balance = await usdcContract.balanceOf(addr.address);
                return { addr, balance };
            } catch (error) {
                console.error(`Error checking address ${addr.address}:`, error);
                return { addr, balance: 0n };
            }
        });

        const balanceResults = await Promise.all(balancePromises);

        // Process deposits sequentially to avoid database conflicts
        for (const { addr, balance } of balanceResults) {
            // Minimum deposit amount (e.g., 0.5 USDC)
            const minDeposit = ethers.parseUnits('0.5', 6); // USDC has 6 decimals

            if (balance > minDeposit) {
                console.log(`Found balance ${ethers.formatUnits(balance, 6)} USDC at ${addr.address}`);
                try {
                    await this.sweepAndCredit(addr, balance);
                } catch (error) {
                    console.error(`Error sweeping and crediting ${addr.address}:`, error);
                }
            }
        }
    }

    private async sweepAndCredit(addr: any, tokenBalance: bigint) {
        if (!MASTER_WALLET_ADDRESS) {
            console.error('MASTER_WALLET_ADDRESS not set');
            return;
        }

        const path = `m/44'/60'/0'/0/${addr.derivationIndex}`;
        const userWallet = this.masterNode.derivePath(path).connect(this.provider);
        const masterWallet = this.masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, userWallet);

        // 1. Check MATIC balance for gas and get fee data in parallel
        let maticBalance: bigint;
        let feeData: ethers.FeeData;
        try {
            [maticBalance, feeData] = await Promise.all([
                this.provider.getBalance(addr.address),
                this.provider.getFeeData()
            ]);
        } catch (error) {
            console.error(`Error fetching balance and fee data for ${addr.address}:`, error);
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
            console.log(`Top-up needed for ${addr.address}. Has ${ethers.formatEther(maticBalance)}, needs ${ethers.formatEther(requiredMatic)}`);

            // Send MATIC from Master
            try {
                const tx = await masterWallet.sendTransaction({
                    to: addr.address,
                    value: requiredMatic - maticBalance, // Top up difference
                    gasLimit: BigInt(21000)
                });
                await tx.wait();
                console.log(`Topped up gas. Hash: ${tx.hash}`);
            } catch (e) {
                console.error('Failed to top up gas:', e);
                return;
            }
        }

        // 2. Sweep Tokens
        try {
            console.log(`[DEPOSIT] Starting token sweep for user ${addr.userId}, address ${addr.address}, balance: ${ethers.formatUnits(tokenBalance, 6)} USDC`);
            const tx = await usdcContract.transfer(MASTER_WALLET_ADDRESS, tokenBalance);
            console.log(`[DEPOSIT] Sweep transaction sent. Hash: ${tx.hash}`);
            await tx.wait();
            console.log(`[DEPOSIT] Sweep transaction confirmed for ${addr.address}`);

            // 3. Credit User
            // USDC is pegged to USD. We take a 1% fee for conversion/service.
            const rawUsdAmount = parseFloat(ethers.formatUnits(tokenBalance, 6));
            const fee = rawUsdAmount * 0.01; // 1% fee
            const usdAmount = rawUsdAmount - fee;

            console.log(`[DEPOSIT] Processing deposit: raw ${rawUsdAmount} USDC, fee ${fee}, crediting ${usdAmount} USD`);

            let dbTransactionSuccess = false;
            try {
                await prisma.$transaction(async (txPrisma) => {
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
                    const balances = await txPrisma.$queryRaw<Array<{id: string, amount: number, locked: number}>>`
                        SELECT id, amount, locked FROM balance
                        WHERE userId = ${addr.userId} AND tokenSymbol = 'TUSD' AND eventId IS NULL AND outcomeId IS NULL
                        FOR UPDATE
                    `;

                    let balanceId: string;
                    let before = 0;
                    if (balances.length > 0) {
                        balanceId = balances[0].id;
                        before = Number(balances[0].amount);
                        await txPrisma.balance.update({
                            where: { id: balanceId },
                            data: { amount: { increment: usdAmount } }
                        });
                    } else {
                        const created = await txPrisma.balance.create({
                            data: {
                                userId: addr.userId,
                                tokenSymbol: 'TUSD',
                                amount: usdAmount,
                                locked: 0
                            }
                        });
                        balanceId = created.id;
                        before = 0;
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
                });
                dbTransactionSuccess = true;
                console.log(`[DEPOSIT] Successfully credited user ${addr.userId} with $${usdAmount}`);
            } catch (dbError) {
                console.error(`[DEPOSIT] Database transaction failed for user ${addr.userId}, attempting rollback:`, dbError);

                // Rollback: Refund tokens back to user wallet
                try {
                    const masterWallet = this.masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);
                    const refundContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, masterWallet);
                    const refundTx = await refundContract.transfer(addr.address, tokenBalance);
                    console.log(`[DEPOSIT] Refund transaction sent. Hash: ${refundTx.hash}`);
                    await refundTx.wait();
                    console.log(`[DEPOSIT] Successfully refunded ${ethers.formatUnits(tokenBalance, 6)} USDC to ${addr.address}`);
                } catch (refundError) {
                    console.error(`[DEPOSIT] CRITICAL: Failed to refund tokens to ${addr.address}. Manual intervention required:`, refundError);
                    // At this point, tokens are swept but user not credited and refund failed
                    // This needs manual intervention
                    throw new Error(`Deposit sweep succeeded but database failed and refund failed for address ${addr.address}`);
                }

                throw dbError; // Re-throw the original DB error
            }

        } catch (error) {
            console.error(`[DEPOSIT] Failed to process deposit for ${addr.address}:`, error);
        }
    }

    async requestWithdrawal(userId: string, amount: number, address: string, currency: string = 'USDC', idempotencyKey?: string) {
        console.log(`[WITHDRAWAL] Requesting withdrawal for user ${userId}: ${amount} ${currency} to ${address}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey})` : ''}`);

        // Check for existing idempotencyKey to prevent duplicates
        if (idempotencyKey) {
            const existingWithdrawal = await prisma.withdrawal.findUnique({
                where: { idempotencyKey }
            });
            if (existingWithdrawal) {
                throw new Error(`Withdrawal request with idempotencyKey ${idempotencyKey} already exists`);
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

        try {
            await prisma.$transaction(async (tx) => {
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
            });

            console.log(`[WITHDRAWAL] Successfully created withdrawal request for user ${userId}`);
        } catch (error) {
            console.error(`[WITHDRAWAL] Failed to create withdrawal request for user ${userId}:`, error);
            throw error;
        }
    }

    async approveWithdrawal(withdrawalId: string, adminId: string) {
        console.log(`[WITHDRAWAL] Starting approval for withdrawal ${withdrawalId} by admin ${adminId}`);

        const withdrawal = await prisma.withdrawal.findUnique({
            where: { id: withdrawalId },
        });

        const isRetryApproved = withdrawal?.status === 'APPROVED' && !withdrawal.txHash;

        if (!withdrawal || (!isRetryApproved && withdrawal.status !== 'PENDING')) {
            const errorMsg = `Invalid withdrawal request: ${withdrawalId} - status: ${withdrawal?.status || 'not found'}`;
            console.error(`[WITHDRAWAL] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        // Idempotency check: ensure withdrawal hasn't been processed before (txHash set)
        if (withdrawal.txHash) {
            const errorMsg = `Withdrawal already processed: ${withdrawalId}`;
            console.error(`[WITHDRAWAL] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        // Validate and update status to APPROVED (skip update on retry of already-approved with no txHash)
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
        } else {
            console.warn(`[WITHDRAWAL] Resuming previously approved withdrawal without txHash ${withdrawalId}`);
        }

        // Convert USD amount to USDC (6 decimals)
        const amountUnits = ethers.parseUnits(withdrawal.amount.toFixed(6), 6);
        console.log(`[WITHDRAWAL] Processing withdrawal of ${withdrawal.amount} USD (${ethers.formatUnits(amountUnits, 6)} USDC) to ${withdrawal.toAddress}`);

        // Use Hot Wallet (Index 0)
        const hotWallet = this.masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, hotWallet);

        let transferTxHash: string | null = null;
        try {
            const tx = await usdcContract.transfer(withdrawal.toAddress, amountUnits);
            transferTxHash = tx.hash;
            console.log(`[WITHDRAWAL] Transfer transaction sent. Hash: ${tx.hash}`);

            // Wait for transaction confirmation and verify
            const receipt = await tx.wait();
            if (receipt.status !== 1) {
                throw new Error(`Blockchain transaction failed with status ${receipt.status}`);
            }
            console.log(`[WITHDRAWAL] Transfer transaction confirmed for withdrawal ${withdrawalId}`);

            // Update database with retry logic for robustness
            let updateAttempts = 0;
            const maxAttempts = 3;
            while (updateAttempts < maxAttempts) {
                try {
                    // Validate status transition (should be APPROVED to COMPLETED)
                    const currentWithdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
                    if (currentWithdrawal) {
                        this.validateWithdrawalStatusTransition(currentWithdrawal.status, 'COMPLETED');
                    }
                    await prisma.withdrawal.update({
                        where: { id: withdrawalId },
                        data: {
                            status: 'COMPLETED',
                            txHash: tx.hash,
                            approvedAt: new Date(),
                            approvedBy: adminId
                        }
                    });

                    // Release locked funds (they were deducted from available at request time)
                    await prisma.$transaction(async (tx) => {
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

                    console.log(`[WITHDRAWAL] Successfully updated withdrawal ${withdrawalId} to COMPLETED`);
                    break; // Success, exit loop
                } catch (dbError) {
                    updateAttempts++;
                    console.warn(`[WITHDRAWAL] DB update attempt ${updateAttempts} failed for ${withdrawalId}:`, dbError);
                    if (updateAttempts >= maxAttempts) {
                        console.error(`[WITHDRAWAL] Failed to update withdrawal status after successful transfer for ${withdrawalId}:`, dbError);
                        // At this point, transfer succeeded but DB update failed
                        // This is a critical error that needs manual intervention
                        throw new Error(`Transfer succeeded but database update failed for withdrawal ${withdrawalId} - manual intervention required`);
                    }
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * updateAttempts));
                }
            }

            return tx.hash;
        } catch (error) {
            console.error(`[WITHDRAWAL] Withdrawal processing failed for ${withdrawalId}:`, error);

            // Attempt to mark as failed and refund
            try {
                await prisma.$transaction(async (tx) => {
                    const currentWithdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
                    if (currentWithdrawal) {
                        // Validate transition to FAILED
                        this.validateWithdrawalStatusTransition(currentWithdrawal.status, 'FAILED');
                    }
                    await tx.withdrawal.update({
                        where: { id: withdrawalId },
                        data: {
                            status: 'FAILED',
                            txHash: transferTxHash // Include tx hash if transfer succeeded
                        }
                    });

                    // Refund with row-level locking
                    const balances = await tx.$queryRaw<Array<{ id: string; amount: any; locked: any }>>`
                        SELECT "id", "amount", "locked" FROM "Balance"
                        WHERE "userId" = ${withdrawal.userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
                        FOR UPDATE
                    `;
                    if (balances.length > 0) {
                        const availableBefore = Number(balances[0].amount);
                        const refundAmount = Number(withdrawal.amount);
                        await tx.balance.update({
                            where: { id: balances[0].id },
                            data: { amount: { increment: refundAmount }, locked: { decrement: refundAmount } }
                        });
                        await this.recordLedger(tx, {
                            userId: withdrawal.userId,
                            direction: 'CREDIT',
                            amount: refundAmount,
                            currency: 'TUSD',
                            balanceBefore: availableBefore,
                            balanceAfter: availableBefore + refundAmount,
                            referenceType: 'WITHDRAWAL_REFUND',
                            referenceId: withdrawalId,
                            metadata: { txHash: transferTxHash }
                        });
                        console.log(`[WITHDRAWAL] Successfully refunded ${refundAmount} USD to user ${withdrawal.userId}`);
                    } else {
                        console.error(`[WITHDRAWAL] No balance found to refund for user ${withdrawal.userId}`);
                    }
                });
            } catch (refundError) {
                console.error(`[WITHDRAWAL] CRITICAL: Failed to update withdrawal status and refund for ${withdrawalId}. Manual intervention required:`, refundError);
                // If both transfer succeeded and refund failed, this is very bad
                // The user has been debited but transfer may or may not have succeeded
                throw new Error(`Withdrawal processing failed and rollback incomplete for ${withdrawalId} - manual intervention required`);
            }

            throw error;
        }
    }
}

let cryptoServiceSingleton: CryptoService | null = null;

export function getCryptoService(): CryptoService {
    if (cryptoServiceSingleton) return cryptoServiceSingleton;
    const mnemonic = process.env.CRYPTO_MASTER_MNEMONIC;
    if (!mnemonic) {
        throw new Error('CRYPTO_MASTER_MNEMONIC environment variable is required');
    }
    cryptoServiceSingleton = new CryptoService(mnemonic);
    return cryptoServiceSingleton;
}
