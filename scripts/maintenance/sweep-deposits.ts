import 'dotenv/config';
import { prisma } from '../../lib/prisma';
import { getCryptoService } from '../../lib/crypto-service';
import { Prisma } from '@prisma/client';

async function main() {
    console.log('🚀 Starting Deposit Sweeper...');
    console.log('Press Ctrl+C to stop');

    while (true) {
        try {
            // Find deposits that are pending sweep
            const pendingDeposits = await prisma.deposit.findMany({
                where: { status: 'PENDING_SWEEP' },
                include: {
                    user: true
                },
                take: 10 // Process in batches
            });

            if (pendingDeposits.length > 0) {
                console.log(`Checking ${pendingDeposits.length} pending deposits...`);

                const service = getCryptoService();

                for (const deposit of pendingDeposits) {
                    try {
                        // Get deposit address info to reconstruct the object needed by generic service
                        const depositAddress = await prisma.depositAddress.findFirst({
                            where: {
                                userId: deposit.userId,
                                address: deposit.fromAddress // Wait, fromAddress is user's external wallet? No.
                                // In the webhook, we logged: processing deposit... for user depositAddress.userId
                                // The deposit money is IN the user's generated address, which is `deposit.toAddress` in the webhook logic?
                                // Let's check the webhook logic.
                            }
                        });

                        // Correction: In Webhook route:
                        // fromAddress = activity.fromAddress (Sender)
                        // toAddress = activity.toAddress (Our generated wallet)
                        // So the funds are at deposit.toAddress.

                        // We need the derivation index for this address.
                        const walletRecord = await prisma.depositAddress.findUnique({
                            where: { address: deposit.toAddress }
                        });

                        if (!walletRecord) {
                            console.error(`Could not find wallet record for address ${deposit.toAddress}`);
                            continue;
                        }

                        // Construct DepositAddressLite
                        const addrLite = {
                            userId: deposit.userId,
                            address: deposit.toAddress,
                            derivationIndex: walletRecord.derivationIndex
                        };

                        // Convert amount to BigInt for the service
                        // deposit.amount is in USDC (e.g. 50.0)
                        // We need atomic units (6 decimals)
                        const amountBigInt = BigInt(Math.round(Number(deposit.amount) * 1_000_000));

                        console.log(`Sweeping deposit ${deposit.id} (${deposit.amount} USDC) from ${deposit.toAddress}`);

                        await service.sweepAndCredit(addrLite, amountBigInt, {
                            sweepOnly: true,
                            depositId: deposit.id
                        });

                    } catch (err) {
                        console.error(`Failed to sweep deposit ${deposit.id}:`, err);
                    }
                }
            }
        } catch (error) {
            console.error('Error in sweeper loop:', error);
        }

        // Wait 30 seconds before next batch
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

main().catch(console.error);
