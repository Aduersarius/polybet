import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DEMO_INITIAL_BALANCE = 10000;

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth(req);

        // Reset DEMO account in transaction
        await prisma.$transaction(async (tx: any) => {
            // 1. Cancel all open DEMO orders
            await tx.order.updateMany({
                where: {
                    userId: user.id,
                    accountType: 'DEMO',
                    status: { in: ['open', 'partially_filled'] }
                },
                data: { status: 'cancelled' }
            });

            // 2. Delete all DEMO balances
            await tx.balance.deleteMany({
                where: {
                    userId: user.id,
                    accountType: 'DEMO'
                }
            });

            // 3. Create fresh DEMO TUSD balance
            await tx.balance.create({
                data: {
                    userId: user.id,
                    tokenSymbol: 'TUSD',
                    eventId: null,
                    outcomeId: null,
                    amount: DEMO_INITIAL_BALANCE,
                    accountType: 'DEMO'
                }
            });

            // 4. Delete DEMO market activity
            await tx.marketActivity.deleteMany({
                where: {
                    userId: user.id,
                    accountType: 'DEMO'
                }
            });

            // 5. Delete DEMO ledger entries
            await tx.ledgerEntry.deleteMany({
                where: {
                    userId: user.id,
                    accountType: 'DEMO'
                }
            });
        });

        return NextResponse.json({
            success: true,
            balance: DEMO_INITIAL_BALANCE,
            message: 'DEMO account reset successfully'
        });

    } catch (error: any) {
        console.error('Error resetting DEMO account:', error);
        return NextResponse.json({ error: error.message || 'Failed to reset DEMO account' }, { status: 500 });
    }
}
