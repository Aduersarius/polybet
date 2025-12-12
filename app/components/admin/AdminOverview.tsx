'use client';

import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Activity, Users, Wallet, BarChart3, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

type TimeseriesPoint = {
    date: string;
    newUsers: number;
    activeBettors: number;
    bets: number;
    volume: number;
    deposits: number;
    withdrawals: number;
};

type OverviewResponse = {
    windowDays: number;
    acquisition: {
        totalUsers: number;
        newUsers: number;
        dau: number;
        wau: number;
        mau: number;
    };
    engagement: {
        betVolume: number;
        betCount: number;
    };
    finance: {
        netFlow: number;
        totalDeposits: number;
        totalWithdrawals: number;
    };
    liquidity: {
        platformBalance: number;
    };
    retention?: {
        retentionRate: number;
        churnRate: number;
    };
    timeseries?: TimeseriesPoint[];
};

const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNumber = (value: number) => value.toLocaleString();

const chartConfigUsers: ChartConfig = {
    newUsers: {
        label: 'New users',
        color: '#aeb0b8',
    },
    activeBettors: {
        label: 'Daily users',
        color: '#d9d9df',
    },
};

const chartConfigBets: ChartConfig = {
    bets: {
        label: 'Bets',
        color: '#9ef3c4',
    },
};

const chartConfigPayments: ChartConfig = {
    deposits: {
        label: 'Deposits',
        color: '#7ce7c1',
    },
    withdrawals: {
        label: 'Withdrawals',
        color: '#f2b8a2',
    },
};

const chartConfigVolume: ChartConfig = {
    volume: {
        label: 'Bet volume',
        color: '#c4f8d3',
    },
};

export function AdminOverview() {
    const [data, setData] = useState<OverviewResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let abort = false;
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch('/api/admin/analytics?windowDays=30');
                if (!res.ok) throw new Error('Failed to load overview');
                const json = (await res.json()) as OverviewResponse;
                if (!abort) setData(json);
            } catch (err) {
                if (!abort) setError(err instanceof Error ? err.message : 'Failed to load overview');
            } finally {
                if (!abort) setLoading(false);
            }
        };
        load();
        return () => {
            abort = true;
        };
    }, []);

    const timeseries = useMemo(() => data?.timeseries || [], [data]);

    const userChartData = timeseries.map((d) => ({
        date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        newUsers: d.newUsers,
        activeBettors: d.activeBettors,
    }));

    const betsChartData = timeseries.map((d) => ({
        date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        bets: d.bets,
    }));

    const paymentsChartData = timeseries.map((d) => ({
        date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        deposits: d.deposits,
        withdrawals: d.withdrawals,
    }));

    const volumeChartData = timeseries.map((d) => ({
        date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        volume: d.volume,
    }));

    return (
        <div className="space-y-6">
            {loading && (
                <Card className="border-0 bg-gradient-to-b from-[#1f1f1f] via-[#171717] to-[#0f0f0f]">
                    <CardHeader>
                        <CardTitle className="text-white">Overview</CardTitle>
                        <CardDescription>Loading overview metrics…</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
                    </CardContent>
                </Card>
            )}

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                    {error}
                </div>
            )}

            {data && !loading && !error && (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            {
                                label: 'Total users',
                                value: formatNumber(data.acquisition.totalUsers),
                                sub: `${formatNumber(data.acquisition.newUsers)} new in ${data.windowDays}d`,
                                icon: <Users className="h-5 w-5 text-blue-300" />,
                            },
                            {
                                label: 'Bet volume',
                                value: formatCurrency(data.engagement.betVolume),
                                sub: `${formatNumber(data.engagement.betCount)} bets`,
                                icon: <BarChart3 className="h-5 w-5 text-emerald-300" />,
                            },
                            {
                                label: 'Net flow',
                                value: formatCurrency(data.finance.netFlow),
                                sub: data.finance.netFlow >= 0 ? 'Inflow positive' : 'Outflow exceeds inflow',
                                icon: <Activity className="h-5 w-5 text-indigo-300" />,
                            },
                            {
                                label: 'Treasury balance',
                                value: formatCurrency(data.liquidity.platformBalance),
                                sub: 'Base token balance',
                                icon: <Wallet className="h-5 w-5 text-purple-300" />,
                            },
                            {
                                label: 'DAU / WAU / MAU',
                                value: `${formatNumber(data.acquisition.dau)} / ${formatNumber(data.acquisition.wau)} / ${formatNumber(data.acquisition.mau)}`,
                                sub: 'Active users',
                                icon: <Users className="h-5 w-5 text-gray-300" />,
                            },
                            {
                                label: 'Deposits',
                                value: formatCurrency(data.finance.totalDeposits),
                                sub: 'Completed deposits',
                                icon: <ArrowDownCircle className="h-5 w-5 text-emerald-300" />,
                            },
                            {
                                label: 'Withdrawals',
                                value: formatCurrency(data.finance.totalWithdrawals),
                                sub: 'Completed withdrawals',
                                icon: <ArrowUpCircle className="h-5 w-5 text-orange-300" />,
                            },
                            {
                                label: 'Retention / Churn',
                                value: data.retention
                                    ? `${data.retention.retentionRate}% / ${data.retention.churnRate}%`
                                    : '—',
                                sub: '30d retention / churn',
                                icon: <Activity className="h-5 w-5 text-cyan-300" />,
                            },
                        ].map((card) => (
                            <div
                                key={card.label}
                                className="rounded-xl border border-white/10 bg-[#161616] p-5 shadow-lg shadow-black/30"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-400">{card.label}</p>
                                        <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
                                        <p className="text-xs text-gray-500">{card.sub}</p>
                                    </div>
                                    <div className="rounded-lg bg-white/5 p-2">{card.icon}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-0 bg-gradient-to-b from-[#1f1f1f] via-[#171717] to-[#0f0f0f]">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-white">New vs daily users</CardTitle>
                                <CardDescription>Last {data.windowDays} days</CardDescription>
                            </CardHeader>
                            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                                {userChartData.length === 0 ? (
                                    <div className="text-gray-400">No data</div>
                                ) : (
                                    <ChartContainer config={chartConfigUsers} className="aspect-auto h-[260px] w-full">
                                        <AreaChart data={userChartData}>
                                            <defs>
                                                <linearGradient id="fillNewUsers" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-newUsers)" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="var(--color-newUsers)" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="fillActiveBettors" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-activeBettors)" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="var(--color-activeBettors)" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid vertical={false} className="stroke-white/20" />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                                            <ChartTooltip
                                                cursor={false}
                                                content={<ChartTooltipContent indicator="dot" labelFormatter={(value) => value} />}
                                            />
                                            <Area
                                                dataKey="newUsers"
                                                type="natural"
                                                fill="url(#fillNewUsers)"
                                                stroke="var(--color-newUsers)"
                                                strokeWidth={2}
                                                stackId="a"
                                            />
                                            <Area
                                                dataKey="activeBettors"
                                                type="natural"
                                                fill="url(#fillActiveBettors)"
                                                stroke="var(--color-activeBettors)"
                                                strokeWidth={2}
                                                stackId="a"
                                            />
                                        </AreaChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-0 bg-gradient-to-b from-[#1f1f1f] via-[#171717] to-[#0f0f0f]">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-white">Number of bets</CardTitle>
                                <CardDescription>Daily bet counts</CardDescription>
                            </CardHeader>
                            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                                {betsChartData.length === 0 ? (
                                    <div className="text-gray-400">No data</div>
                                ) : (
                                    <ChartContainer config={chartConfigBets} className="aspect-auto h-[260px] w-full">
                                        <AreaChart data={betsChartData}>
                                            <defs>
                                                <linearGradient id="fillBets" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-bets)" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="var(--color-bets)" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid vertical={false} className="stroke-white/20" />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                                            <ChartTooltip
                                                cursor={false}
                                                content={<ChartTooltipContent indicator="dot" labelFormatter={(value) => value} />}
                                            />
                                            <Area
                                                dataKey="bets"
                                                type="natural"
                                                fill="url(#fillBets)"
                                                stroke="var(--color-bets)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-0 bg-gradient-to-b from-[#1f1f1f] via-[#171717] to-[#0f0f0f]">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-white">Deposits vs withdrawals</CardTitle>
                                <CardDescription>Completed amounts by day</CardDescription>
                            </CardHeader>
                            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                                {paymentsChartData.length === 0 ? (
                                    <div className="text-gray-400">No data</div>
                                ) : (
                                    <ChartContainer config={chartConfigPayments} className="aspect-auto h-[260px] w-full">
                                        <AreaChart data={paymentsChartData}>
                                            <defs>
                                                <linearGradient id="fillDeposits" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-deposits)" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="var(--color-deposits)" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="fillWithdrawals" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-withdrawals)" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="var(--color-withdrawals)" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid vertical={false} className="stroke-white/20" />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                                            <ChartTooltip
                                                cursor={false}
                                                content={<ChartTooltipContent indicator="dot" labelFormatter={(value) => value} />}
                                            />
                                            <Area
                                                dataKey="deposits"
                                                type="natural"
                                                fill="url(#fillDeposits)"
                                                stroke="var(--color-deposits)"
                                                strokeWidth={2}
                                                stackId="p"
                                            />
                                            <Area
                                                dataKey="withdrawals"
                                                type="natural"
                                                fill="url(#fillWithdrawals)"
                                                stroke="var(--color-withdrawals)"
                                                strokeWidth={2}
                                                stackId="p"
                                            />
                                        </AreaChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-0 bg-gradient-to-b from-[#1f1f1f] via-[#171717] to-[#0f0f0f]">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-white">Bet volume</CardTitle>
                                <CardDescription>Daily bet volume</CardDescription>
                            </CardHeader>
                            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                                {volumeChartData.length === 0 ? (
                                    <div className="text-gray-400">No data</div>
                                ) : (
                                    <ChartContainer config={chartConfigVolume} className="aspect-auto h-[260px] w-full">
                                        <AreaChart data={volumeChartData}>
                                            <defs>
                                                <linearGradient id="fillVolume" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-volume)" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="var(--color-volume)" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid vertical={false} className="stroke-white/20" />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                                            <ChartTooltip
                                                cursor={false}
                                                content={<ChartTooltipContent indicator="dot" labelFormatter={(value) => value} />}
                                            />
                                            <Area
                                                dataKey="volume"
                                                type="natural"
                                                fill="url(#fillVolume)"
                                                stroke="var(--color-volume)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}

