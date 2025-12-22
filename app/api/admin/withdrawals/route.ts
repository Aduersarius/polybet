import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCryptoService } from '@/lib/crypto-service';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth, verifyUserTotp } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

// Status transition validation
function validateWithdrawalStatusTransition(currentStatus: string, newStatus: string) {
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

export async function GET(req: NextRequest) {
    try {
        // Admin authentication check
        await requireAdminAuth(req);

        const withdrawals = await prisma.withdrawal.findMany({
            where: { status: 'PENDING' },
            include: { user: true },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(withdrawals);
    } catch (error: any) {
        console.error('Error fetching withdrawals:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status || 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        // Admin authentication check
        const admin = await requireAdminAuth(req);
        const adminId = admin.id;

        const body = await req.json();
        const { withdrawalId, action, totpCode } = body;

        if (!withdrawalId || !action) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // Fetch withdrawal details for audit logging and policy enforcement
        const withdrawalDetails = await prisma.withdrawal.findUnique({
            where: { id: withdrawalId },
            select: { userId: true, amount: true, currency: true, toAddress: true, status: true, createdAt: true }
        });

        if (!withdrawalDetails) {
            return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
        }

        // Audit logging
        console.log(JSON.stringify({
            type: 'ADMIN_WITHDRAWAL_ACTION',
            adminId,
            adminEmail: admin.email,
            withdrawalId,
            action,
            withdrawalDetails,
            timestamp: new Date().toISOString(),
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
        }));

        if (action === 'APPROVE') {
            const adminRecord = await prisma.user.findUnique({
                where: { id: adminId },
                select: { twoFactorEnabled: true }
            });

            if (!adminRecord?.twoFactorEnabled) {
                return NextResponse.json({ error: 'Admin 2FA is required to approve withdrawals' }, { status: 403 });
            }

            if (!totpCode) {
                return NextResponse.json({ error: 'TOTP code is required' }, { status: 401 });
            }

            // Use Better Auth's verification which handles encrypted secrets
            const isValid = await verifyUserTotp(adminId, totpCode);
            if (!isValid) {
                return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 401 });
            }

            const maxSingle = Number(process.env.ADMIN_WITHDRAW_MAX_SINGLE ?? 50000);
            const maxDaily = Number(process.env.ADMIN_WITHDRAW_MAX_DAILY ?? 200000);
            if (!Number.isFinite(maxSingle) || maxSingle <= 0 || !Number.isFinite(maxDaily) || maxDaily <= 0) {
                return NextResponse.json({ error: 'Admin withdrawal limits misconfigured on server' }, { status: 503 });
            }

            if (withdrawalDetails && Number(withdrawalDetails.amount) > maxSingle) {
                return NextResponse.json({ error: `Withdrawal exceeds admin per-request cap of ${maxSingle}` }, { status: 400 });
            }

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
            const pendingAmount = Number(withdrawalDetails?.amount || 0);

            if (usedToday + pendingAmount > maxDaily) {
                const remaining = Math.max(0, maxDaily - usedToday);
                return NextResponse.json({
                    error: `Daily admin approval cap exceeded. Remaining today: ${remaining}`
                }, { status: 400 });
            }

            const service = getCryptoService();
            const txHash = await service.approveWithdrawal(withdrawalId, adminId);
            return NextResponse.json({ success: true, txHash });
        } else if (action === 'REJECT') {
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
                if (!withdrawal) throw new Error('Invalid withdrawal');

                // Validate status transition
                validateWithdrawalStatusTransition(withdrawal.status, 'REJECTED');

                // Additional validation: ensure withdrawal hasn't been processed
                if (withdrawal.txHash) throw new Error('Cannot reject a processed withdrawal');

                // Lock user's base balance row
                const balances = await tx.$queryRaw<Array<{ id: string; amount: any; locked: any }>>`
                    SELECT "id", "amount", "locked" FROM "Balance"
                    WHERE "userId" = ${withdrawal.userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
                    FOR UPDATE
                `;
                if (balances.length === 0) {
                    throw new Error('User balance not found for refund');
                }
                const availableBefore = Number(balances[0].amount);
                const lockedBefore = Number(balances[0].locked || 0);
                const lockedDecrement = Math.min(lockedBefore, Number(withdrawal.amount));

                await tx.balance.update({
                    where: { id: balances[0].id },
                    data: {
                        amount: { increment: withdrawal.amount },
                        locked: { decrement: lockedDecrement }
                    }
                });

                await tx.withdrawal.update({
                    where: { id: withdrawalId },
                    data: { status: 'REJECTED', approvedBy: adminId, approvedAt: new Date() }
                });

                // Write ledger entry only if the table exists
                const ledgerTableResult = await tx.$queryRaw<Array<{ exists: boolean }>>`
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = 'LedgerEntry'
                    ) AS "exists"
                `;
                if (ledgerTableResult?.[0]?.exists) {
                // Ensure ledger schema exists
                const [lockedColResult, ledgerTableResult] = await Promise.all([
                    tx.$queryRaw<Array<{ exists: boolean }>>`
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'Balance' AND column_name = 'locked'
                        ) AS "exists"
                    `,
                    tx.$queryRaw<Array<{ exists: boolean }>>`
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.tables
                            WHERE table_schema = 'public' AND table_name = 'LedgerEntry'
                        ) AS "exists"
                    `
                ]);

                const hasLockedColumn = Boolean(lockedColResult?.[0]?.exists);
                const hasLedgerTable = Boolean(ledgerTableResult?.[0]?.exists);

                if (!hasLockedColumn || !hasLedgerTable) {
                    throw new Error('Ledger schema missing: ensure Balance.locked and LedgerEntry table exist (run latest migrations).');
                }

                await tx.ledgerEntry.create({
                    data: {
                        userId: withdrawal.userId,
                        direction: 'CREDIT',
                        amount: withdrawal.amount,
                        currency: 'TUSD',
                        balanceBefore: availableBefore,
                        balanceAfter: availableBefore + Number(withdrawal.amount),
                        referenceType: 'WITHDRAWAL_REJECT',
                        referenceId: withdrawalId,
                        metadata: { adminId }
                    }
                });
                } else {
                    console.warn('[ADMIN WITHDRAWAL] LedgerEntry table missing; skipping ledger write');
                }
            });
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error: any) {
        if (error?.message?.includes('CRYPTO_MASTER_MNEMONIC')) {
            return NextResponse.json({ error: 'Crypto service not configured' }, { status: 503 });
        }
        console.error('Error processing withdrawal:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status || 500 });
    }
}
