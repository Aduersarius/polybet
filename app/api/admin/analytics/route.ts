import { NextRequest, NextResponse } from 'next/server';
import { subDays, differenceInHours, startOfDay, addDays } from 'date-fns';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

const percentile = (values: number[], p: number) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
};

export async function GET(req: NextRequest) {
    try {
        await requireAdminAuth(req);

        const { searchParams } = new URL(req.url);
        const windowDaysRaw = parseInt(searchParams.get('windowDays') || '30', 10);
        const windowDays = Math.min(Math.max(windowDaysRaw || 30, 1), 180);
        const now = new Date();
        const windowStart = subDays(now, windowDays);

        const [
            totalUsers,
            newUsersWindow,
            dau,
            wau,
            mau,
            bannedUsers,
            activeLast30d,
            activeEvents,
            resolvedEvents,
            eventsWindow,
            marketActivityWindow,
            depositAggAll,
            depositAggWindow,
            depositFailedWindowCount,
            depositPendingWindowCount,
            withdrawalAggCompleted,
            withdrawalAggWindowCompleted,
            withdrawalPendingAgg,
            withdrawalFailedWindowCount,
            withdrawalCompletedForTiming,
            balanceAgg,
            outcomeBalanceAgg,
            usersWindowRecords,
            depositWindowRecords,
            withdrawalWindowRecords,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { createdAt: { gte: windowStart } } }),
            prisma.user.count({ where: { lastVisitedAt: { gte: subDays(now, 1) } } }),
            prisma.user.count({ where: { lastVisitedAt: { gte: subDays(now, 7) } } }),
            prisma.user.count({ where: { lastVisitedAt: { gte: subDays(now, 30) } } }),
            prisma.user.count({ where: { isBanned: true } }),
            prisma.user.count({ where: { lastVisitedAt: { gte: windowStart } } }),
            prisma.event.count({ where: { status: 'ACTIVE' } }),
            prisma.event.count({ where: { status: 'RESOLVED' } }),
            prisma.event.findMany({
                where: { createdAt: { gte: windowStart } },
                select: { id: true, title: true, status: true, categories: true, createdAt: true },
            }),
            prisma.marketActivity.findMany({
                where: { createdAt: { gte: windowStart } },
                select: { userId: true, eventId: true, amount: true, price: true, type: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 10000,
            }),
            prisma.deposit.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { amount: true },
                _count: true,
            }),
            prisma.deposit.aggregate({
                where: { status: 'COMPLETED', createdAt: { gte: windowStart } },
                _sum: { amount: true },
                _count: true,
            }),
            prisma.deposit.count({ where: { status: 'FAILED', createdAt: { gte: windowStart } } }),
            prisma.deposit.count({ where: { status: 'PENDING', createdAt: { gte: windowStart } } }),
            prisma.withdrawal.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { amount: true },
                _count: true,
            }),
            prisma.withdrawal.aggregate({
                where: { status: 'COMPLETED', createdAt: { gte: windowStart } },
                _sum: { amount: true },
                _count: true,
            }),
            prisma.withdrawal.aggregate({
                where: { status: 'PENDING' },
                _sum: { amount: true },
                _count: true,
            }),
            prisma.withdrawal.count({ where: { status: 'FAILED', createdAt: { gte: windowStart } } }),
            prisma.withdrawal.findMany({
                where: { status: 'COMPLETED', createdAt: { gte: windowStart } },
                select: { createdAt: true, updatedAt: true },
                orderBy: { createdAt: 'desc' },
                take: 2000,
            }),
            prisma.balance.aggregate({
                where: { tokenSymbol: 'TUSD', eventId: null, outcomeId: null },
                _sum: { amount: true, locked: true },
            }),
            prisma.balance.aggregate({
                where: { outcomeId: { not: null } },
                _sum: { amount: true },
            }),
            prisma.user.findMany({
                where: { createdAt: { gte: windowStart } },
                select: { createdAt: true },
            }),
            prisma.deposit.findMany({
                where: { status: 'COMPLETED', createdAt: { gte: windowStart } },
                select: { amount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5000,
            }),
            prisma.withdrawal.findMany({
                where: { status: 'COMPLETED', createdAt: { gte: windowStart } },
                select: { amount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5000,
            }),
        ]);

        const activityItems = marketActivityWindow as Array<{
            userId: string;
            eventId: string;
            amount: number;
            price: number | null;
            createdAt: Date;
        }>;

        const marketActivityVolume = activityItems.reduce(
            (acc: number, m) => acc + m.amount * (m.price ?? 1),
            0
        );
        const uniqueBettors = new Set(activityItems.map((m) => m.userId)).size;
        const eventsBetOn = new Set(activityItems.map((m) => m.eventId)).size;
        const repeatBettorsPct = uniqueBettors
            ? Math.round(
                (Object.entries(
                    activityItems.reduce((acc: Record<string, number>, m) => {
                        acc[m.userId] = (acc[m.userId] || 0) + 1;
                        return acc;
                    }, {})
                ).filter(([, count]) => count > 1).length /
                    uniqueBettors) *
                100
            )
            : 0;

        const betSizes = activityItems
            .map((m) => m.amount * (m.price ?? 1))
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => a - b);
        const medianBetSize = betSizes.length
            ? (betSizes[Math.floor((betSizes.length - 1) / 2)] +
                  betSizes[Math.ceil((betSizes.length - 1) / 2)]) /
              2
            : 0;
        const p99BetSize = betSizes.length
            ? betSizes[Math.min(betSizes.length - 1, Math.floor(betSizes.length * 0.99))]
            : 0;

        const betsPerEvent = eventsBetOn ? marketActivityWindow.length / eventsBetOn : 0;
        const betsPerActiveDay = dau ? marketActivityWindow.length / dau : 0;
        const avgUniqueBettorsPerEvent = eventsBetOn ? uniqueBettors / eventsBetOn : 0;
        const avgVolumePerEvent = eventsBetOn ? marketActivityVolume / eventsBetOn : 0;

        const topEventsMap = activityItems.reduce<Record<string, { volume: number; bettors: Set<string> }>>(
            (acc, m) => {
                const entry = acc[m.eventId] || { volume: 0, bettors: new Set<string>() };
                entry.volume += m.amount * (m.price ?? 1);
                entry.bettors.add(m.userId);
                acc[m.eventId] = entry;
                return acc;
            },
            {}
        );

        const topEvents = Object.entries(topEventsMap)
            .map(([eventId, data]) => {
                const event = eventsWindow.find((e: { id: string; title?: string }) => e.id === eventId);
                return {
                    id: eventId,
                    title: event?.title || 'Event',
                    volume: data.volume,
                    uniqueBettors: data.bettors.size,
                };
            })
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 5);

        const categories = eventsWindow
            .flatMap((e: { categories?: string[] }) => e.categories || [])
            .reduce((acc: Record<string, number>, cat: string) => {
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
            }, {});

        const withdrawDurationsHours = withdrawalCompletedForTiming
            .map((w: { updatedAt: Date; createdAt: Date }) => differenceInHours(w.updatedAt, w.createdAt))
            .filter((d: number) => d >= 0);

        const payoutSuccessTotal = withdrawalAggWindowCompleted._count || 0;
        const payoutFailedTotal = withdrawalFailedWindowCount || 0;
        const payoutAttemptTotal = payoutSuccessTotal + payoutFailedTotal;

        const depositSuccessTotal = depositAggWindow._count || 0;
        const depositFailTotal = depositFailedWindowCount || 0;
        const depositPendingTotal = depositPendingWindowCount || 0;
        const depositAttemptTotal = depositSuccessTotal + depositFailTotal + depositPendingTotal;

        // Timeseries buckets
        const days = Array.from({ length: windowDays }, (_, i) => startOfDay(addDays(windowStart, i)));
        const toKey = (date: Date) => startOfDay(date).getTime();

        const newUsersByDay = usersWindowRecords.reduce((acc: Record<number, number>, u: { createdAt: Date }) => {
            const key = toKey(new Date(u.createdAt));
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const betsByDay = activityItems.reduce<Record<number, number>>((acc, m) => {
            const key = toKey(new Date(m.createdAt));
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const volumeByDay = activityItems.reduce<Record<number, number>>((acc, m) => {
            const key = toKey(new Date(m.createdAt));
            acc[key] = (acc[key] || 0) + m.amount * (m.price ?? 1);
            return acc;
        }, {});

        const activeBettorsByDay = activityItems.reduce<Record<number, Set<string>>>((acc, m) => {
            const key = toKey(new Date(m.createdAt));
            const set = acc[key] || new Set<string>();
            set.add(m.userId);
            acc[key] = set;
            return acc;
        }, {});

        const depositsByDay = depositWindowRecords.reduce((acc: Record<number, number>, d: { createdAt: Date; amount: Prisma.Decimal | number }) => {
            const key = toKey(new Date(d.createdAt));
            acc[key] = (acc[key] || 0) + toNumber(d.amount);
            return acc;
        }, {});

        const withdrawalsByDay = withdrawalWindowRecords.reduce((acc: Record<number, number>, w: { createdAt: Date; amount: Prisma.Decimal | number }) => {
            const key = toKey(new Date(w.createdAt));
            acc[key] = (acc[key] || 0) + toNumber(w.amount);
            return acc;
        }, {});

        const timeseries = days.map((day) => {
            const key = day.getTime();
            return {
                date: day.toISOString(),
                newUsers: newUsersByDay[key] || 0,
                activeBettors: activeBettorsByDay[key]?.size || 0,
                bets: betsByDay[key] || 0,
                volume: volumeByDay[key] || 0,
                deposits: depositsByDay[key] || 0,
                withdrawals: withdrawalsByDay[key] || 0,
            };
        });

        const retentionRate = totalUsers
            ? Math.round(((activeLast30d || 0) / Math.max(1, totalUsers)) * 100)
            : 0;
        const churnRate = totalUsers ? Math.max(0, 100 - retentionRate) : 0;

        const response = {
            windowDays,
            acquisition: {
                totalUsers,
                newUsers: newUsersWindow,
                dau,
                wau,
                mau,
            },
            engagement: {
                betCount: marketActivityWindow.length,
                betVolume: marketActivityVolume,
                uniqueBettors,
                eventsBetOn,
                avgBetSize:
                    marketActivityWindow.length > 0
                        ? marketActivityVolume / marketActivityWindow.length
                        : 0,
                repeatBettorsPct,
                betsPerEvent,
                betsPerActiveDay,
                avgUniqueBettorsPerEvent,
                avgVolumePerEvent,
                medianBetSize,
                p99BetSize,
            },
            finance: {
                totalDeposits: toNumber(depositAggAll._sum.amount),
                totalWithdrawals: toNumber(withdrawalAggCompleted._sum.amount),
                netFlow: toNumber(depositAggAll._sum.amount) - toNumber(withdrawalAggCompleted._sum.amount),
                depositCount: depositAggAll._count,
                withdrawalCount: withdrawalAggCompleted._count,
                depositSuccessRate: depositAttemptTotal
                    ? Math.round((depositSuccessTotal / depositAttemptTotal) * 100)
                    : 0,
                withdrawalSuccessRate: payoutAttemptTotal
                    ? Math.round((payoutSuccessTotal / payoutAttemptTotal) * 100)
                    : 0,
            },
            liquidity: {
                lockedBalance: toNumber(balanceAgg._sum.locked),
                platformBalance: toNumber(balanceAgg._sum.amount),
                availableBalance: toNumber(balanceAgg._sum.amount) - toNumber(balanceAgg._sum.locked),
                openInterest: toNumber(outcomeBalanceAgg._sum.amount),
                openInterestPerEvent: activeEvents ? toNumber(outcomeBalanceAgg._sum.amount) / activeEvents : 0,
            },
            payouts: {
                completedAmount: toNumber(withdrawalAggCompleted._sum.amount),
                completedCount: withdrawalAggCompleted._count,
                pendingAmount: toNumber(withdrawalPendingAgg._sum.amount),
                pendingCount: withdrawalPendingAgg._count,
                timeToCompleteP50: percentile(withdrawDurationsHours, 0.5),
                timeToCompleteP95: percentile(withdrawDurationsHours, 0.95),
                failedCount: withdrawalFailedWindowCount,
                successRate: payoutAttemptTotal
                    ? Math.round((payoutSuccessTotal / payoutAttemptTotal) * 100)
                    : 0,
            },
            content: {
                activeEvents,
                resolvedEvents,
                newEvents: eventsWindow.length,
                categories: Object.entries(categories)
                    .map(([name, count]) => ({ name, count: count as number }))
                    .sort((a, b) => (b.count as number) - (a.count as number))
                    .slice(0, 6),
                topEvents,
            },
            risk: {
                bannedUsers,
                failedWithdrawalsWindow: withdrawalFailedWindowCount,
                failedDepositsWindow: depositFailedWindowCount,
            },
            retention: {
                retentionRate,
                churnRate,
                activeUsersWindow: activeLast30d || 0,
            },
            timeseries,
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Error building admin analytics:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

