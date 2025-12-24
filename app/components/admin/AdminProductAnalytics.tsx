'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowDownCircle,
    ArrowUpCircle,
    BarChart3,
    Clock,
    Gauge,
    ShieldAlert,
    Wallet,
} from 'lucide-react';

type CategoryStat = { name: string; count: number };
type TopEvent = { id: string; title: string; volume: number; uniqueBettors: number };

type AnalyticsResponse = {
    windowDays: number;
    acquisition: {
        totalUsers: number;
        newUsers: number;
        dau: number;
        wau: number;
        mau: number;
    };
    engagement: {
        betCount: number;
        betVolume: number;
        uniqueBettors: number;
        eventsBetOn: number;
        avgBetSize: number;
        repeatBettorsPct: number;
        betsPerEvent: number;
        betsPerActiveDay: number;
        avgUniqueBettorsPerEvent: number;
        avgVolumePerEvent: number;
        medianBetSize: number;
        p99BetSize: number;
    };
    finance: {
        totalDeposits: number;
        totalWithdrawals: number;
        netFlow: number;
        depositCount: number;
        withdrawalCount: number;
        depositSuccessRate: number;
        withdrawalSuccessRate: number;
    };
    liquidity: {
        lockedBalance: number;
        platformBalance: number;
        availableBalance: number;
        openInterest: number;
        openInterestPerEvent: number;
    };
    payouts: {
        completedAmount: number;
        completedCount: number;
        pendingAmount: number;
        pendingCount: number;
        timeToCompleteP50: number;
        timeToCompleteP95: number;
        failedCount: number;
        successRate: number;
    };
    content: {
        activeEvents: number;
        resolvedEvents: number;
        newEvents: number;
        categories: CategoryStat[];
        topEvents: TopEvent[];
    };
    risk: {
        bannedUsers: number;
        failedWithdrawalsWindow: number;
        failedDepositsWindow: number;
    };
    retention?: {
        retentionRate: number;
        churnRate: number;
        activeUsersWindow: number;
    };
    timeseries?: {
        date: string;
        newUsers: number;
        activeBettors: number;
        bets: number;
        deposits: number;
        withdrawals: number;
    }[];
};

const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNumber = (value: number) => value.toLocaleString();

const timeRanges = [
    { label: '7d', value: 7 },
    { label: '30d', value: 30 },
    { label: '90d', value: 90 },
];

export function AdminProductAnalytics() {
    const [range, setRange] = useState(30);
    const [data, setData] = useState<AnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let abort = false;
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/admin/analytics?windowDays=${range}`);
                if (!res.ok) throw new Error('Failed to load analytics');
                const json = (await res.json()) as AnalyticsResponse;
                if (!abort) setData(json);
            } catch (err) {
                if (!abort) setError(err instanceof Error ? err.message : 'Failed to load analytics');
            } finally {
                if (!abort) setLoading(false);
            }
        };
        load();
        return () => {
            abort = true;
        };
    }, [range]);

    const health = useMemo(() => {
        if (!data) {
            return { liquidityRatio: 0, engagementDepth: 0 };
        }
        const { engagement, finance, liquidity } = data;
        const liquidityRatio =
            liquidity.platformBalance > 0
                ? Math.round((liquidity.availableBalance / liquidity.platformBalance) * 100)
                : 0;
        const engagementDepth =
            engagement.uniqueBettors > 0
                ? Math.round((engagement.betCount / engagement.uniqueBettors) * 10) / 10
                : 0;
        const netFlowDirection =
            finance.netFlow >= 0 ? 'Inflow positive' : 'Outflow exceeds inflow';
        return { liquidityRatio, engagementDepth, netFlowDirection };
    }, [data]);

    const cards = useMemo(() => {
        if (!data) return [];
        return [
            {
                label: 'New users',
                value: formatNumber(data.acquisition.newUsers),
                sub: `${data.acquisition.totalUsers.toLocaleString()} total`,
                icon: <Activity className="h-4 w-4 text-emerald-300" />,
            },
            {
                label: 'Active bettors (WAU)',
                value: formatNumber(data.acquisition.wau),
                sub: `DAU ${formatNumber(data.acquisition.dau)} · MAU ${formatNumber(data.acquisition.mau)}`,
                icon: <Gauge className="h-4 w-4 text-blue-300" />,
            },
            {
                label: 'Bet volume',
                value: formatCurrency(data.engagement.betVolume),
                sub: `${formatNumber(data.engagement.betCount)} bets · ${formatNumber(data.engagement.uniqueBettors)} bettors`,
                icon: <BarChart3 className="h-4 w-4 text-cyan-300" />,
            },
            {
                label: 'Net flow',
                value: formatCurrency(data.finance.netFlow),
                sub:
                    data.finance.netFlow >= 0
                        ? 'Inflow positive'
                        : 'Outflow exceeds inflow',
                icon: <Activity className="h-4 w-4 text-indigo-300" />,
            },
            {
                label: 'Withdrawals completed',
                value: formatCurrency(data.payouts.completedAmount),
                sub: `${formatNumber(data.payouts.completedCount)} completed · ${data.payouts.successRate}% success`,
                icon: <ArrowUpCircle className="h-4 w-4 text-orange-300" />,
            },
            {
                label: 'Deposits completed',
                value: formatCurrency(data.finance.totalDeposits),
                sub: `${formatNumber(data.finance.depositCount)} deposits · ${data.finance.depositSuccessRate}% success`,
                icon: <ArrowDownCircle className="h-4 w-4 text-emerald-300" />,
            },
            {
                label: 'Liquidity',
                value: formatCurrency(data.liquidity.availableBalance),
                sub: `Locked ${formatCurrency(data.liquidity.lockedBalance)}`,
                icon: <Wallet className="h-4 w-4 text-purple-300" />,
            },
            {
                label: 'Risk signals',
                value: `${data.risk.failedWithdrawalsWindow + data.risk.failedDepositsWindow}`,
                sub: `${data.risk.bannedUsers} banned users`,
                icon: <ShieldAlert className="h-4 w-4 text-red-300" />,
            },
        ];
    }, [data]);

    const alerts = useMemo(() => {
        if (!data) return [];
        const list: { level: 'warning' | 'critical'; message: string }[] = [];
        if (data.payouts.pendingAmount > data.liquidity.availableBalance * 0.6) {
            list.push({
                level: 'warning',
                message: 'Pending withdrawals are consuming more than 60% of available balance.',
            });
        }
        if (data.payouts.successRate < 90) {
            list.push({
                level: 'critical',
                message: `Withdrawal success rate is ${data.payouts.successRate}% (target ≥ 90%).`,
            });
        }
        if (data.risk.failedWithdrawalsWindow + data.risk.failedDepositsWindow > 10) {
            list.push({
                level: 'critical',
                message: 'Failure counts across payments exceed 10 in the selected window.',
            });
        }
        if (data.engagement.uniqueBettors === 0 || data.engagement.betCount === 0) {
            list.push({
                level: 'warning',
                message: 'No betting activity detected in this window.',
            });
        }
        return list;
    }, [data]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Product analytics</p>
                    <h2 className="text-3xl font-bold text-zinc-200">Trading & liquidity health</h2>
                    <p className="text-sm text-muted-foreground">
                        Acquisition, engagement, payouts, and treasury signals for the selected window.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {timeRanges.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => setRange(t.value)}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${range === t.value
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface p-4 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading analytics...
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
                    {error}
                </div>
            )}

            {data && !loading && !error && (
                <>
                    {alerts.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
                            <div className="flex items-center gap-2 font-semibold text-amber-200">
                                <AlertTriangle className="h-4 w-4" />
                                Attention needed
                            </div>
                            <ul className="mt-2 space-y-1 list-disc list-inside text-amber-100">
                                {alerts.map((alert, idx) => (
                                    <li key={idx} className={alert.level === 'critical' ? 'text-red-200' : ''}>
                                        {alert.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {cards.map((card) => (
                            <div
                                key={card.label}
                                className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-muted-foreground">{card.label}</p>
                                        <p className="mt-2 text-2xl font-bold text-zinc-200">{card.value}</p>
                                        <p className="text-xs text-zinc-500">{card.sub}</p>
                                    </div>
                                    <div className="rounded-lg bg-white/5 p-2">{card.icon}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30 lg:col-span-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Engagement & volume</p>
                                    <p className="text-xl font-semibold text-zinc-200">Betting activity</p>
                                </div>
                                <Activity className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <StatChip label="Unique bettors" value={formatNumber(data.engagement.uniqueBettors)} />
                                <StatChip label="Events bet on" value={formatNumber(data.engagement.eventsBetOn)} />
                                <StatChip
                                    label="Avg bet size"
                                    value={formatCurrency(data.engagement.avgBetSize)}
                                />
                                <StatChip
                                    label="Repeat bettors"
                                    value={`${data.engagement.repeatBettorsPct}%`}
                                    tone="amber"
                                />
                                <StatChip
                                    label="Bets per bettor"
                                    value={
                                        data.engagement.uniqueBettors
                                            ? (data.engagement.betCount / data.engagement.uniqueBettors).toFixed(1)
                                            : '0.0'
                                    }
                                />
                                <StatChip
                                    label="Volume / WAU"
                                    value={
                                        data.acquisition.wau
                                            ? formatCurrency(data.engagement.betVolume / data.acquisition.wau)
                                            : '$0.00'
                                    }
                                />
                                <StatChip
                                    label="Bets per event"
                                    value={
                                        data.engagement.eventsBetOn
                                            ? (data.engagement.betCount / data.engagement.eventsBetOn).toFixed(1)
                                            : '0.0'
                                    }
                                />
                                <StatChip
                                    label="Bets per active day"
                                    value={
                                        data.acquisition.dau
                                            ? (data.engagement.betCount / data.acquisition.dau).toFixed(1)
                                            : '0.0'
                                    }
                                />
                                <StatChip
                                    label="Median bet size"
                                    value={formatCurrency(data.engagement.medianBetSize)}
                                />
                                <StatChip
                                    label="P99 bet size"
                                    value={formatCurrency(data.engagement.p99BetSize)}
                                />
                                <StatChip
                                    label="Unique bettors / event"
                                    value={
                                        data.engagement.eventsBetOn
                                            ? (data.engagement.avgUniqueBettorsPerEvent || 0).toFixed(1)
                                            : '0.0'
                                    }
                                />
                                <StatChip
                                    label="Volume / event"
                                    value={formatCurrency(data.engagement.avgVolumePerEvent || 0)}
                                />
                                <StatChip
                                    label="Open interest / event"
                                    value={formatCurrency(data.liquidity.openInterestPerEvent || 0)}
                                />
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Treasury & liquidity</p>
                                    <p className="text-xl font-semibold text-zinc-200">Liquidity posture</p>
                                </div>
                                <Gauge className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-4 space-y-3">
                                <StatChip
                                    label="Available balance"
                                    value={formatCurrency(data.liquidity.availableBalance)}
                                />
                                <StatChip
                                    label="Locked funds"
                                    value={formatCurrency(data.liquidity.lockedBalance)}
                                />
                                <StatChip
                                    label="Liquidity ratio"
                                    value={`${health.liquidityRatio}%`}
                                    tone="blue"
                                />
                                <StatChip
                                    label="Open interest"
                                    value={formatCurrency(data.liquidity.openInterest)}
                                />
                                <StatChip
                                    label="Engagement depth"
                                    value={`${health.engagementDepth} bets/user`}
                                    tone="emerald"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30 lg:col-span-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Events & supply</p>
                                    <p className="text-xl font-semibold text-zinc-200">Content performance</p>
                                </div>
                                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <StatChip label="Active events" value={formatNumber(data.content.activeEvents)} />
                                <StatChip label="Resolved events" value={formatNumber(data.content.resolvedEvents)} />
                                <StatChip label="New events" value={formatNumber(data.content.newEvents)} />
                            </div>
                            <div className="mt-4">
                                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-2">Top categories</p>
                                <div className="space-y-2">
                                    {data.content.categories.length === 0 && (
                                        <p className="text-sm text-zinc-500">No categories in window.</p>
                                    )}
                                    {data.content.categories.map((cat) => (
                                        <div key={cat.name} className="flex items-center justify-between text-sm">
                                            <span className="text-zinc-300">{cat.name}</span>
                                            <span className="text-muted-foreground">{cat.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Risk & ops</p>
                                    <p className="text-xl font-semibold text-zinc-200">Payout health</p>
                                </div>
                                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-4 space-y-3">
                                <StatChip
                                    label="Pending withdrawals"
                                    value={`${formatCurrency(data.payouts.pendingAmount)} · ${formatNumber(
                                        data.payouts.pendingCount
                                    )} pending`}
                                />
                                <StatChip
                                    label="Time to complete"
                                    value={`p50 ${data.payouts.timeToCompleteP50}h · p95 ${data.payouts.timeToCompleteP95}h`}
                                />
                                <StatChip
                                    label="Failure count"
                                    value={`${formatNumber(data.payouts.failedCount)} window`}
                                    tone="red"
                                />
                                <StatChip
                                    label="Withdrawal success"
                                    value={`${data.payouts.successRate}%`}
                                    tone="emerald"
                                />
                                <StatChip
                                    label="Failed deposits"
                                    value={`${formatNumber(data.risk.failedDepositsWindow)} window`}
                                    tone="amber"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Top events</p>
                                <p className="text-xl font-semibold text-zinc-200">Volume leaders</p>
                            </div>
                            <Clock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-white/5 text-left text-xs uppercase text-muted-foreground">
                                    <tr>
                                        <th className="py-2 pr-3 font-medium">Event</th>
                                        <th className="py-2 pr-3 font-medium">Volume</th>
                                        <th className="py-2 pr-3 font-medium">Unique bettors</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.content.topEvents.length === 0 && (
                                        <tr>
                                            <td className="py-3 pr-3 text-muted-foreground" colSpan={3}>
                                                No event activity in this window.
                                            </td>
                                        </tr>
                                    )}
                                    {data.content.topEvents.map((evt) => (
                                        <tr key={evt.id} className="hover:bg-white/5 transition-colors">
                                            <td className="py-3 pr-3 text-zinc-200">{evt.title}</td>
                                            <td className="py-3 pr-3 text-zinc-300 font-semibold">
                                                {formatCurrency(evt.volume)}
                                            </td>
                                            <td className="py-3 pr-3 text-zinc-300">
                                                {formatNumber(evt.uniqueBettors)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

type StatChipProps = {
    label: string;
    value: string;
    tone?: 'emerald' | 'blue' | 'amber' | 'red';
};

function StatChip({ label, value, tone = 'emerald' }: StatChipProps) {
    const toneKey: NonNullable<StatChipProps['tone']> = tone ?? 'emerald';
    const toneClasses: Record<'emerald' | 'blue' | 'amber' | 'red', string> = {
        emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200',
        blue: 'border-blue-500/30 bg-blue-500/5 text-blue-200',
        amber: 'border-amber-500/30 bg-amber-500/5 text-amber-200',
        red: 'border-red-500/30 bg-red-500/5 text-red-200',
    };
    return (
        <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-sm font-semibold ${toneClasses[toneKey]} mt-1 inline-flex px-2 py-1 rounded-md`}>
                {value}
            </p>
        </div>
    );
}

