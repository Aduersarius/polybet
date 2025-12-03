import { ethers } from 'ethers';
import { prisma } from '@/lib/prisma';

const MASTER_MNEMONIC = process.env.CRYPTO_MASTER_MNEMONIC || 'test test test test test test test test test test test junk';
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

    constructor() {
        this.provider = new ethers.JsonRpcProvider(PROVIDER_URL);
        // Initialize with root path "m" to avoid derivation errors
        this.masterNode = ethers.HDNodeWallet.fromPhrase(MASTER_MNEMONIC, undefined, "m");
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

        for (const addr of addresses) {
            try {
                const balance = await usdcContract.balanceOf(addr.address);
                // Minimum deposit amount (e.g., 1 USDC)
                const minDeposit = ethers.parseUnits('1', 6); // USDC has 6 decimals

                if (balance > minDeposit) {
                    console.log(`Found balance ${ethers.formatUnits(balance, 6)} USDC at ${addr.address}`);
                    await this.sweepAndCredit(addr, balance);
                }
            } catch (error) {
                console.error(`Error checking address ${addr.address}:`, error);
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

        // 1. Check MATIC balance for gas
        const maticBalance = await this.provider.getBalance(addr.address);

        // Estimate gas for transfer
        // Standard ERC20 transfer is ~65,000 gas
        const gasLimit = BigInt(100000);
        const feeData = await this.provider.getFeeData();
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
            const tx = await usdcContract.transfer(MASTER_WALLET_ADDRESS, tokenBalance);
            console.log(`Sweeping USDC... Hash: ${tx.hash}`);
            await tx.wait();

            // 3. Credit User
            // USDC is pegged to USD. We take a 1% fee for conversion/service.
            const rawUsdAmount = parseFloat(ethers.formatUnits(tokenBalance, 6));
            const fee = rawUsdAmount * 0.01; // 1% fee
            const usdAmount = rawUsdAmount - fee;

            console.log(`Processed deposit: ${rawUsdAmount} USDC. Fee: ${fee}. Crediting: ${usdAmount}`);

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

                // Update User Balance
                const safeUserBalance = await txPrisma.balance.findFirst({
                    where: {
                        userId: addr.userId,
                        tokenSymbol: 'TUSD',
                        eventId: null,
                        outcomeId: null
                    }
                });

                if (safeUserBalance) {
                    await txPrisma.balance.update({
                        where: { id: safeUserBalance.id },
                        data: { amount: { increment: usdAmount } }
                    });
                } else {
                    await txPrisma.balance.create({
                        data: {
                            userId: addr.userId,
                            tokenSymbol: 'TUSD',
                            amount: usdAmount
                        }
                    });
                }
            });

            console.log(`Credited user ${addr.userId} with $${usdAmount}`);

        } catch (error) {
            console.error(`Failed to sweep from ${addr.address}:`, error);
        }
    }

    async requestWithdrawal(userId: string, amount: number, address: string, currency: string = 'USDC') {
        const userBalance = await prisma.balance.findFirst({
            where: {
                userId,
                tokenSymbol: 'TUSD'
            }
        });

        if (!userBalance || userBalance.amount < amount) {
            throw new Error('Insufficient balance');
        }

        await prisma.withdrawal.create({
            data: {
                userId,
                amount,
                currency,
                toAddress: address,
                status: 'PENDING'
            }
        });

        await prisma.balance.update({
            where: { id: userBalance.id },
            data: { amount: { decrement: amount } }
        });
    }

    async approveWithdrawal(withdrawalId: string, adminId: string) {
        const withdrawal = await prisma.withdrawal.findUnique({
            where: { id: withdrawalId },
        });

        if (!withdrawal || withdrawal.status !== 'PENDING') {
            throw new Error('Invalid withdrawal request');
        }

        // Convert USD amount to USDC (6 decimals)
        const amountUnits = ethers.parseUnits(withdrawal.amount.toFixed(6), 6);

        // Use Hot Wallet (Index 0)
        const hotWallet = this.masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(this.provider);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, hotWallet);

        try {
            const tx = await usdcContract.transfer(withdrawal.toAddress, amountUnits);

            await prisma.withdrawal.update({
                where: { id: withdrawalId },
                data: {
                    status: 'COMPLETED',
                    txHash: tx.hash,
                    approvedAt: new Date(),
                    approvedBy: adminId
                }
            });

            return tx.hash;
        } catch (error) {
            console.error('Withdrawal failed:', error);
            await prisma.withdrawal.update({
                where: { id: withdrawalId },
                data: { status: 'FAILED' }
            });

            // Refund
            const userBalance = await prisma.balance.findFirst({
                where: {
                    userId: withdrawal.userId,
                    tokenSymbol: 'TUSD'
                }
            });
            if (userBalance) {
                await prisma.balance.update({
                    where: { id: userBalance.id },
                    data: { amount: { increment: withdrawal.amount } }
                });
            }

            throw error;
        }
    }
}

export const cryptoService = new CryptoService();
