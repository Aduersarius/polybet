import { NextRequest, NextResponse } from 'next/server';
import { cryptoService } from '@/lib/crypto-service';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    // TODO: Add Admin Auth check

    const withdrawals = await prisma.withdrawal.findMany({
        where: { status: 'PENDING' },
        include: { user: true },
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(withdrawals);
}

export async function POST(req: NextRequest) {
    // TODO: Add Admin Auth check
    const adminId = req.headers.get('x-user-id') || 'admin'; // Mock admin ID

    const body = await req.json();
    const { withdrawalId, action } = body;

    if (!withdrawalId || !action) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    try {
        if (action === 'APPROVE') {
            const txHash = await cryptoService.approveWithdrawal(withdrawalId, adminId);
            return NextResponse.json({ success: true, txHash });
        } else if (action === 'REJECT') {
            // Implement rejection (refund)
            await prisma.$transaction(async (tx) => {
                const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
                if (!withdrawal || withdrawal.status !== 'PENDING') throw new Error('Invalid withdrawal');

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
        console.error('Error processing withdrawal:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
