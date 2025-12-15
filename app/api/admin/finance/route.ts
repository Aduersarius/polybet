import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toNumber = (value: any) => Number(value || 0);

export async function GET(req: NextRequest) {
    try {
        await requireAdminAuth(req);

        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
        const before = searchParams.get('before');
        const mode = searchParams.get('mode'); // mode=stats returns only stats to reduce payload

        const [
            depositSum,
            depositCount,
            completedWithdrawalSum,
            completedWithdrawalCount,
            pendingWithdrawalSum,
            pendingWithdrawalCount,
        ] = await prisma.$transaction([
            prisma.deposit.aggregate({ _sum: { amount: true } }),
            prisma.deposit.count(),
            prisma.withdrawal.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { amount: true },
            }),
            prisma.withdrawal.count({
                where: { status: 'COMPLETED' },
            }),
            prisma.withdrawal.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
            prisma.withdrawal.count({ where: { status: 'PENDING' } }),
        ]);

        let ledgerCount = 0;
        try {
            ledgerCount = await prisma.ledgerEntry.count();
        } catch (err: any) {
            if (err?.code === 'P2021') {
                console.warn('admin/finance: ledger count skipped because table missing (P2021)');
            } else {
                throw err;
            }
        }

        let balanceAgg = { _sum: { amount: 0, locked: 0 } };
        try {
            const balanceAggRaw = await prisma.balance.aggregate({
                where: { tokenSymbol: 'TUSD', eventId: null, outcomeId: null },
                _sum: { amount: true, locked: true },
            });
            balanceAgg = {
                _sum: {
                    amount: toNumber(balanceAggRaw._sum.amount),
                    locked: toNumber(balanceAggRaw._sum.locked),
                },
            };
        } catch (err: any) {
            if (err?.code === 'P2022') {
                console.warn('admin/finance: balance aggregate skipped due to schema mismatch (P2022)');
            } else {
                throw err;
            }
        }

        const totalDeposits = toNumber(depositSum._sum.amount);
        const totalWithdrawals = toNumber(completedWithdrawalSum._sum.amount);
        const lockedBalance = toNumber(balanceAgg._sum.locked);
        const platformBalance = toNumber(balanceAgg._sum.amount);

        const stats = {
            totalDeposits,
            totalWithdrawals,
            netFlow: totalDeposits - totalWithdrawals,
            depositCount,
            withdrawalCount: completedWithdrawalCount,
            pendingWithdrawalAmount: toNumber(pendingWithdrawalSum._sum.amount),
            pendingWithdrawalCount,
            platformBalance,
            lockedBalance,
            availableBalance: platformBalance - lockedBalance,
            ledgerEntries: ledgerCount,
        };

        if (mode === 'stats') {
            return NextResponse.json({ stats, transactions: [] });
        }

        const whereClause = before
            ? { createdAt: { lt: new Date(before) } }
            : undefined;

        const [depositRecords, withdrawalRecords] = await prisma.$transaction([
            prisma.deposit.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                take: limit + 1,
                include: {
                    user: { select: { id: true, username: true, email: true } },
                },
            }),
            prisma.withdrawal.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                take: limit + 1,
                include: {
                    user: { select: { id: true, username: true, email: true } },
                },
            }),
        ]);

        const combined = [
            ...depositRecords.map((d: (typeof depositRecords)[number]) => ({
                id: d.id,
                type: 'DEPOSIT' as const,
                amount: toNumber(d.amount),
                currency: d.currency,
                status: d.status,
                createdAt: d.createdAt,
                txHash: d.txHash,
                fromAddress: d.fromAddress,
                toAddress: d.toAddress,
                user: d.user,
            })),
            ...withdrawalRecords.map((w: (typeof withdrawalRecords)[number]) => ({
                id: w.id,
                type: 'WITHDRAWAL' as const,
                amount: toNumber(w.amount),
                currency: w.currency,
                status: w.status,
                createdAt: w.createdAt,
                txHash: w.txHash,
                fromAddress: undefined,
                toAddress: w.toAddress,
                user: w.user,
            })),
        ].sort(
            (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const transactions = combined.slice(0, limit);
        const hasMore = combined.length > limit;
        const nextCursor = hasMore ? combined[limit - 1]?.createdAt : null;

        return NextResponse.json({ stats, transactions, hasMore, nextCursor });
    } catch (error) {
        console.error('Error fetching admin finance data:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
