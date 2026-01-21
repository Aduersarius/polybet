'use step';

import { prisma } from '@/lib/prisma';
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';

const USDC_NATIVE_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDC_BRIDGED_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
];

// Helper to get provider/wallet inside step
function getBlockchainContext() {
    const providerUrl = process.env.POLYGON_PROVIDER_URL;
    const mnemonic = process.env.CRYPTO_MASTER_MNEMONIC;
    if (!providerUrl || !mnemonic) throw new Error('Missing crypto env vars');

    const provider = new ethers.JsonRpcProvider(providerUrl);
    const masterNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, 'm');
    const masterWallet = masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(provider);

    return { provider, masterNode, masterWallet };
}

export async function checkBalancesStep(batchOffset: number, batchSize: number) {
    const { provider } = getBlockchainContext();

    const addresses = await prisma.depositAddress.findMany({
        where: { currency: 'USDC' },
        orderBy: { userId: 'asc' },
        take: batchSize,
        skip: batchOffset
    });

    const foundDeposits: Array<{
        address: string;
        userId: string;
        derivationIndex: number;
        balance: string; // BigInt serialized
        tokenAddress: string;
        symbol: string;
    }> = [];

    const minDeposit = ethers.parseUnits('0.1', 6);

    await Promise.all(addresses.map(async (addr: { address: string; userId: string; derivationIndex: number }) => {
        try {
            const tokens = [
                { address: USDC_NATIVE_ADDRESS, symbol: 'USDC' },
                { address: USDC_BRIDGED_ADDRESS, symbol: 'USDC.e' }
            ];

            for (const token of tokens) {
                const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
                // Simple balance check - optimization: multicall if scale increases
                const balance = await contract.balanceOf(addr.address);
                if (balance > minDeposit) {
                    foundDeposits.push({
                        address: addr.address,
                        userId: addr.userId,
                        derivationIndex: addr.derivationIndex,
                        balance: balance.toString(),
                        tokenAddress: token.address,
                        symbol: token.symbol
                    });
                }
            }
        } catch (e) {
            console.error(`[Sweep] Failed to check balance for ${addr.address}:`, e);
        }
    }));

    return { foundDeposits, hasMore: addresses.length === batchSize };
}

export async function sweepDepositStep(depositData: {
    address: string;
    userId: string;
    derivationIndex: number;
    balance: string;
    tokenAddress: string;
    symbol: string;
}) {
    const { provider, masterNode, masterWallet } = getBlockchainContext();
    const balance = BigInt(depositData.balance);
    const MASTER_WALLET_ADDRESS = masterWallet.address;

    console.log(`[Sweep] Processing sweep for ${depositData.address} (${depositData.symbol})`);

    // Derivation
    const path = `m/44'/60'/0'/0/${depositData.derivationIndex}`;
    const userWallet = masterNode.derivePath(path).connect(provider);

    // 1. Gas Check & Topup
    const maticBalance = await provider.getBalance(depositData.address);
    const feeData = await provider.getFeeData();

    // Aggressive gas settings for reliability
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('40', 'gwei');
    const maxFeePerGas = (feeData.maxFeePerGas || ethers.parseUnits('150', 'gwei')) * 2n;
    const gasLimit = 100000n;
    const requiredMatic = gasLimit * maxFeePerGas;

    if (maticBalance < requiredMatic) {
        console.log(`[Sweep] Topping up gas for ${depositData.address}`);
        const tx = await masterWallet.sendTransaction({
            to: depositData.address,
            value: requiredMatic * 2n,
            maxFeePerGas,
            maxPriorityFeePerGas
        });
        await tx.wait();
    }

    // 2. Sweep Transfer
    const tokenContract = new ethers.Contract(depositData.tokenAddress, ERC20_ABI, userWallet);
    const tx = await tokenContract.transfer(MASTER_WALLET_ADDRESS, balance, {
        maxFeePerGas,
        maxPriorityFeePerGas
    });
    console.log(`[Sweep] Sweep TX sent: ${tx.hash}`);
    await tx.wait();

    // 3. Database Credit (Atomic)
    const rawAmount = parseFloat(ethers.formatUnits(balance, 6));
    const fee = rawAmount * 0.01;
    const finalAmount = rawAmount - fee;

    const result = await prisma.$transaction(async (txPrisma: Prisma.TransactionClient) => {
        // Balance Logic
        const userBalance = await txPrisma.balance.findFirst({
            where: { userId: depositData.userId, tokenSymbol: 'TUSD', eventId: null, outcomeId: null }
        });

        const balanceBefore = userBalance ? Number(userBalance.amount) : 0;
        const balanceAfter = balanceBefore + finalAmount;

        // Create Deposit Record
        const deposit = await txPrisma.deposit.create({
            data: {
                userId: depositData.userId,
                amount: rawAmount,
                currency: depositData.symbol,
                txHash: tx.hash,
                status: 'COMPLETED',
                fromAddress: depositData.address,
                toAddress: MASTER_WALLET_ADDRESS
            }
        });

        if (userBalance) {
            await txPrisma.balance.update({
                where: { id: userBalance.id },
                data: { amount: { increment: finalAmount } }
            });
        } else {
            await txPrisma.balance.create({
                data: {
                    userId: depositData.userId,
                    tokenSymbol: 'TUSD',
                    amount: finalAmount,
                    locked: 0
                }
            });
        }

        // Ledger
        await txPrisma.ledgerEntry.create({
            data: {
                userId: depositData.userId,
                direction: 'CREDIT',
                amount: new Prisma.Decimal(finalAmount),
                currency: 'USD',
                referenceType: 'DEPOSIT',
                referenceId: deposit.id,
                balanceBefore: new Prisma.Decimal(balanceBefore),
                balanceAfter: new Prisma.Decimal(balanceAfter),
                metadata: {
                    description: `Sweep Deposit (${depositData.symbol})`,
                    fee: fee,
                    originalAmount: rawAmount,
                    txHash: tx.hash
                }
            }
        });

        // Legacy Balance
        await txPrisma.user.update({
            where: { id: depositData.userId },
            data: { currentBalance: { increment: finalAmount } }
        });

        return { success: true, txHash: tx.hash, amount: finalAmount };
    });

    // Notify via Pusher (Soketi) - AFTER transaction commit
    try {
        const { default: Pusher } = await import('pusher');
        const pusher = new Pusher({
            appId: process.env.SOKETI_DEFAULT_APP_ID || 'pariflow',
            key: process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key',
            secret: process.env.SOKETI_DEFAULT_APP_SECRET || 'pariflow_secret',
            host: process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.pariflow.com',
            port: process.env.NEXT_PUBLIC_SOKETI_PORT || '443',
            useTLS: process.env.NEXT_PUBLIC_SOKETI_USE_TLS !== 'false',
        });

        await pusher.trigger(`user-${depositData.userId}`, 'user-update', {
            type: 'DEPOSIT_SUCCESS',
            payload: { message: `Deposit of $${finalAmount} confirmed!` }
        });
    } catch (e) {
        console.error('[Sweep] Failed to send Pusher notification:', e);
    }

    return result;
}
