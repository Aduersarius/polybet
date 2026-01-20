
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAlchemySignature, AlchemyWebhookPayload } from '@/lib/alchemy-webhook';
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';

// Support both USDC tokens on Polygon
const USDC_NATIVE_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'.toLowerCase(); // Native USDC
const USDC_BRIDGED_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'.toLowerCase(); // USDC.e (bridged)

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
            // 1. Filter for valid USDC transfers (both native and bridged)
            const assetAddress = activity.rawContract.address?.toLowerCase();

            // Check if it's either USDC or USDC.e
            if (assetAddress !== USDC_NATIVE_ADDRESS && assetAddress !== USDC_BRIDGED_ADDRESS) {
                continue;
            }

            // Determine token symbol for logging
            const tokenSymbol = assetAddress === USDC_NATIVE_ADDRESS ? 'USDC' : 'USDC.e';

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

            console.log(`[Webhook] Processing deposit: ${usdcAmount} ${tokenSymbol} for user ${depositAddress.userId} (Tx: ${activity.hash})`);

            let depositId!: string; // Definite assignment - will be set in transaction

            // 5. Transaction: Create Deposit + Update Stats
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // Create Deposit Record (will be credited by sweep monitor after successful sweep)
                const deposit = await tx.deposit.create({
                    data: {
                        userId: depositAddress.userId,
                        amount: new Prisma.Decimal(usdcAmount),
                        currency: tokenSymbol,
                        txHash: activity.hash,
                        status: 'PENDING_SWEEP',
                        fromAddress: activity.fromAddress,
                        toAddress: activity.toAddress,
                    }
                });

                depositId = deposit.id;

                // Update Lifetime Stats only
                await tx.user.update({
                    where: { id: depositAddress.userId },
                    data: {
                        totalDeposited: { increment: usdcAmount }
                    }
                });

                // Create a "PENDING" Notification instead of "SUCCESS"
                await tx.notification.create({
                    data: {
                        userId: depositAddress.userId,
                        type: 'DEPOSIT_PENDING',
                        message: `Deposit of ${usdcAmount} ${tokenSymbol} detected. Funds will be available after network confirmation.`,
                        resourceId: deposit.id,
                        isRead: false,
                        metadata: {
                            amount: usdcAmount,
                            currency: tokenSymbol,
                            txHash: activity.hash
                        }
                    }
                });

                // Publish via Pusher (Soketi) for Frontend
                try {
                    const { triggerUserUpdate } = await import('@/lib/pusher-server');

                    await triggerUserUpdate(depositAddress.userId, 'transaction-update', {
                        id: activity.hash,
                        type: 'Deposit',
                        amount: usdcAmount,
                        currency: tokenSymbol,
                        status: 'PENDING',
                        createdAt: new Date().toISOString()
                    });
                } catch (redisErr) {
                    console.error('[Webhook] Failed to publish Redis update:', redisErr);
                }
            });

            // 6. Trigger immediate sweep (non-blocking)
            // Import crypto service dynamically to avoid circular dependencies
            console.log(`[Webhook] Triggering immediate sweep for deposit ${depositId}...`);

            // Run sweep in background - don't await to keep webhook fast
            (async () => {
                try {
                    const { getCryptoService } = await import('@/lib/crypto-service');
                    const cryptoService = getCryptoService();

                    // Determine token address
                    const tokenAddress = assetAddress === USDC_NATIVE_ADDRESS
                        ? USDC_NATIVE_ADDRESS
                        : USDC_BRIDGED_ADDRESS;

                    await cryptoService.sweepAndCredit(
                        depositAddress,
                        amountBigInt,
                        {
                            sweepOnly: true,
                            depositId: depositId,
                            tokenAddress: tokenAddress
                        }
                    );

                    console.log(`[Webhook] ✅ Sweep completed for deposit ${depositId}`);
                } catch (sweepError) {
                    console.error('[Webhook] ⚠️  Sweep failed for deposit %s:', depositId, sweepError);
                    console.log(`[Webhook] Sweep-monitor will retry this deposit`);
                }
            })();

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


