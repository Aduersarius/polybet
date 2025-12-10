import { NextRequest, NextResponse } from 'next/server';
import { getCryptoService } from '@/lib/crypto-service';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

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
        // Admin authentication check
        const admin = await requireAdminAuth(req);
        const adminId = admin.id;

        const body = await req.json();
        const { withdrawalId, action } = body;

        if (!withdrawalId || !action) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // Fetch withdrawal details for audit logging
        const withdrawalDetails = await prisma.withdrawal.findUnique({
            where: { id: withdrawalId },
            select: { userId: true, amount: true, currency: true, toAddress: true }
        });

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
            const service = getCryptoService();
            const txHash = await service.approveWithdrawal(withdrawalId, adminId);
            return NextResponse.json({ success: true, txHash });
        } else if (action === 'REJECT') {
            // Implement rejection (refund)
            await prisma.$transaction(async (tx) => {
                const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
                if (!withdrawal) throw new Error('Invalid withdrawal');

                // Validate status transition
                validateWithdrawalStatusTransition(withdrawal.status, 'REJECTED');

                // Additional validation: ensure withdrawal hasn't been processed
                if (withdrawal.txHash) throw new Error('Cannot reject a processed withdrawal');

                await tx.withdrawal.update({
                    where: { id: withdrawalId },
                    data: { status: 'REJECTED', approvedBy: adminId, approvedAt: new Date() }
                });

                // Refund
                const userBalance = await tx.balance.findFirst({
                    where: { userId: withdrawal.userId, tokenSymbol: 'TUSD' }
                });

                if (userBalance) {
                    await tx.balance.update({
                        where: { id: userBalance.id },
                        data: { amount: { increment: withdrawal.amount } }
                    });
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
