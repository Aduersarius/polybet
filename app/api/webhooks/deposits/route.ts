
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAlchemySignature, AlchemyWebhookPayload } from '@/lib/alchemy-webhook';
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';

// Use same USDC address as crypto-service
const USDC_ADDRESS = (process.env.USDC_CONTRACT_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359').toLowerCase();

export async function POST(req: NextRequest) {
    try {
        const signature = req.headers.get('x-alchemy-signature');
        const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;

        if (!signingKey) {
            console.error('Missing ALCHEMY_WEBHOOK_SIGNING_KEY');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (!signature) {
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
        }

        const bodyText = await req.text();

        // Verify signature
        if (!verifyAlchemySignature(bodyText, signature, signingKey)) {
            console.error('Invalid Alchemy signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(bodyText) as AlchemyWebhookPayload;

        if (payload.type !== 'ADDRESS_ACTIVITY') {
            return NextResponse.json({ message: 'Ignored event type' });
        }

        const activities = payload.event.activity;
        let processedCount = 0;

        for (const activity of activities) {
            // 1. Filter for valid USDC transfers
            // We only care about incoming transfers (we don't check 'toAddress' here yet, we query DB)
            // Asset address should match USDC or be null (native token) - but we only want USDC usually depending on game logic
            // Based on crypto-service, we only sweep USDC.

            const assetAddress = activity.rawContract.address?.toLowerCase();

            // If asset is not USDC, ignore (unless you want to support MATIC deposits too?)
            // For now, let's stick to USDC as per crypto-service.ts
            if (assetAddress !== USDC_ADDRESS) {
                continue;
            }

            // 2. Check if 'toAddress' belongs to a user
            const toAddress = activity.toAddress;

            const depositAddress = await prisma.depositAddress.findUnique({
                where: { address: toAddress },
                include: { user: true }
            });

            if (!depositAddress) {
                // Not one of our addresses, ignore
                continue;
            }

            // 3. Check for idempotency (Transaction Hash)
            // Note: A single tx could theoretically have multiple transfers, but usually 1 per user per tx
            const existingDeposit = await prisma.deposit.findUnique({
                where: { txHash: activity.hash }
            });

            if (existingDeposit) {
                console.log(`Deposit ${activity.hash} already processed`);
                continue;
            }

            // 4. Parse Value
            // Alchemy sends rawValue as hex string
            const rawValueHex = activity.rawContract.rawValue;
            const amountBigInt = BigInt(rawValueHex);

            // USDC has 6 decimals
            const usdcAmount = parseFloat(ethers.formatUnits(amountBigInt, 6));

            // 1% Fee Logic (matching crypto-service.ts)
            const fee = usdcAmount * 0.01;
            const netAmount = usdcAmount - fee;

            console.log(`[Webhook] Processing deposit: ${usdcAmount} USDC for user ${depositAddress.userId} (Tx: ${activity.hash})`);

            // 5. Transaction: Create Deposit + Credit User + Ledger
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // Read current balance for ledger
                const user = await tx.user.findUnique({
                    where: { id: depositAddress.userId },
                    select: { currentBalance: true }
                });
                const balanceBefore = user?.currentBalance ? Number(user.currentBalance) : 0;
                const balanceAfter = balanceBefore + netAmount;

                // Create Deposit Record
                const deposit = await tx.deposit.create({
                    data: {
                        userId: depositAddress.userId,
                        amount: new Prisma.Decimal(usdcAmount),
                        currency: 'USDC',
                        txHash: activity.hash,
                        status: 'PENDING_SWEEP', // New status indicating it needs sweeping
                        fromAddress: activity.fromAddress,
                        toAddress: activity.toAddress,
                    }
                });

                // Credit User Balance
                await tx.user.update({
                    where: { id: depositAddress.userId },
                    data: {
                        currentBalance: { increment: netAmount },
                        totalDeposited: { increment: usdcAmount }
                    }
                });

                // Create Ledger Entry
                await tx.ledgerEntry.create({
                    data: {
                        userId: depositAddress.userId,
                        direction: 'CREDIT',
                        amount: new Prisma.Decimal(netAmount),
                        currency: 'USD',
                        referenceType: 'DEPOSIT',
                        referenceId: deposit.id,
                        balanceBefore: new Prisma.Decimal(balanceBefore),
                        balanceAfter: new Prisma.Decimal(balanceAfter),
                        metadata: {
                            description: 'Crypto Deposit (USDC)',
                            fee: fee,
                            originalAmount: usdcAmount,
                            currency: 'USDC',
                            txHash: activity.hash
                        }
                    }
                });

                // Create Notification
                await tx.notification.create({
                    data: {
                        userId: depositAddress.userId,
                        type: 'DEPOSIT_SUCCESS',
                        message: `Deposit of ${usdcAmount} USDC successfully processed.`,
                        resourceId: deposit.id,
                        isRead: false
                    }
                });

                // Broadcast deposit via Redis Pub/Sub
                try {
                    const message = JSON.stringify({
                        type: 'transaction',
                        userId: depositAddress.userId,
                        payload: {
                            id: activity.hash, // Using txHash as ID for UI until fetch refresh
                            type: 'Deposit',
                            amount: usdcAmount,
                            currency: 'USDC',
                            status: 'COMPLETED',
                            createdAt: new Date().toISOString()
                        }
                    });

                    const notification = JSON.stringify({
                        type: 'notification',
                        userId: depositAddress.userId,
                        payload: {
                            userId: depositAddress.userId,
                            type: 'DEPOSIT_SUCCESS',
                            message: `Deposit of ${usdcAmount} USDC successfully processed.`,
                            resourceId: activity.hash
                        }
                    });

                    await redis.publish('user-updates', message);
                    await redis.publish('user-updates', notification);
                } catch (redisErr) {
                    console.error('[Webhook] Failed to publish Redis update:', redisErr);
                }
            });

            processedCount++;
        }

        return NextResponse.json({
            success: true,
            processed: processedCount
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


