'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfDay, subDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Activity, ArrowUpRight, BarChart2, LineChart as LineChartIcon, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AdminUser = {
    id: string;
    address: string;
    username: string | null;
    email: string | null;
    name: string | null;
    isBanned: boolean;
    isAdmin: boolean;
    createdAt: string;
    _count?: {
        bets?: number;
        createdEvents?: number;
        marketActivity?: number;
    };
};

type AdminEvent = {
    id: string;
    title: string;
    categories: string[];
    type: string;
    status: string;
    isHidden: boolean;
    createdAt: string;
    resolutionDate?: string | null;
    _count?: {
        bets?: number;
        marketActivity?: number;
    };
};

type StatRowProps = {
    label: string;
    value: string;
    tone: 'emerald' | 'blue' | 'purple' | 'cyan' | 'pink' | 'orange' | 'yellow' | 'red';
};

const toneMap: Record<StatRowProps['tone'], string> = {
    emerald: 'text-emerald-200 border-emerald-500/40 bg-emerald-500/10',
    blue: 'text-blue-200 border-blue-500/40 bg-blue-500/10',
    purple: 'text-purple-200 border-purple-500/40 bg-purple-500/10',
    cyan: 'text-cyan-200 border-cyan-500/40 bg-cyan-500/10',
    pink: 'text-pink-200 border-pink-500/40 bg-pink-500/10',
    orange: 'text-orange-200 border-orange-500/40 bg-orange-500/10',
    yellow: 'text-yellow-200 border-yellow-500/40 bg-yellow-500/10',
    red: 'text-red-200 border-red-500/40 bg-red-500/10'
};

function HealthRow({ label, value, tone }: StatRowProps) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
            <span className="text-sm text-gray-200">{label}</span>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${toneMap[tone]}`}>{value}</span>
        </div>
    );
}

export function AdminStatistics() {
    const adminId = 'dev-user';

    const { data: usersData, isLoading: usersLoading } = useQuery({
        queryKey: ['admin', 'users', adminId],
        queryFn: async () => {
            const res = await fetch(`/api/admin/users?adminId=${adminId}&limit=1000`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json() as Promise<{ users: AdminUser[]; total: number }>;
        }
    });

    const { data: eventsData, isLoading: eventsLoading } = useQuery({
        queryKey: ['admin', 'events', adminId],
        queryFn: async () => {
            const res = await fetch(`/api/admin/events?adminId=${adminId}&limit=1000`);
            if (!res.ok) throw new Error('Failed to fetch events');
            return res.json() as Promise<{ events: AdminEvent[]; total: number }>;
        }
    });

    const users = usersData?.users || [];
    const events = eventsData?.events || [];

    const stats = useMemo(() => {
        const toNum = (value: unknown) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        };

        const getUserBets = (user: AdminUser) =>
            toNum(user._count?.bets ?? user._count?.marketActivity);
        const getUserEvents = (user: AdminUser) => toNum(user._count?.createdEvents);
        const getEventBets = (event: AdminEvent) =>
            toNum(event._count?.bets ?? event._count?.marketActivity);

        const now = startOfDay(new Date());
        const recentWindow = subDays(now, 30);

        const totalUsers = users.length;
        const activeUsers = users.filter((u) => !u.isBanned).length;
        const adminUsers = users.filter((u) => u.isAdmin).length;
        const totalEvents = events.length;
        const activeEvents = events.filter((e) => e.status === 'ACTIVE').length;
        const resolvedEvents = events.filter((e) => e.status === 'RESOLVED').length;

        const totalBets = users.reduce((sum, u) => sum + getUserBets(u), 0);
        const payingUsers = users.filter((u) => getUserBets(u) > 0).length;
        const creators = users.filter((u) => getUserEvents(u) > 0).length;
        const powerUsers = users.filter((u) => getUserBets(u) >= 10).length;

        const recentUsers = users.filter((u) => parseISO(u.createdAt) >= recentWindow).length;
        const recentEvents = events.filter((e) => parseISO(e.createdAt) >= recentWindow).length;
        const recentResolvedEvents = events.filter(
            (e) => e.resolutionDate && parseISO(e.resolutionDate) >= recentWindow
        ).length;

        const engagementRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0;
        const creatorRate = totalUsers > 0 ? Math.round((creators / totalUsers) * 100) : 0;
        const participationRate = totalEvents > 0
            ? Math.round(
                (events.filter((e) => getEventBets(e) > 0).length / totalEvents) * 100
            )
            : 0;

        const revenue = totalBets * 0.1; // mock revenue
        const arppu = payingUsers > 0 ? Math.round(((revenue / payingUsers) * 100)) / 100 : 0;
        const ltv = Math.round(arppu * 3 * 100) / 100;

        const categories = events
            .flatMap((e) => e.categories)
            .reduce<Record<string, number>>((acc, cat) => {
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
            }, {});

        const sortedCategories = Object.entries(categories)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        const rangeStart = subDays(now, 13);
        const range = eachDayOfInterval({ start: rangeStart, end: now });

        // Track daily user base (carry forward users created before the 14-day window)
        const initialUsersBeforeRange = users.filter((u) => parseISO(u.createdAt) < rangeStart).length;
        let runningUsers = initialUsersBeforeRange;

        const chart = range.map((day) => {
            const newUsers = users.filter((u) => isSameDay(parseISO(u.createdAt), day)).length;
            runningUsers += newUsers;
            return {
                date: format(day, 'MMM d'),
                dailyUsers: runningUsers,
                newUsers
            };
        });

        const topUsers = [...users]
            .map((u) => ({
                id: u.id,
                username: u.username || u.address || 'Anonymous',
                email: u.email,
                bets: getUserBets(u),
                events: getUserEvents(u),
                isBanned: u.isBanned,
                isAdmin: u.isAdmin,
                createdAt: u.createdAt
            }))
            .sort((a, b) => b.bets - a.bets)
            .slice(0, 8);

        const churnRate = totalUsers > 0
            ? Math.round((users.filter((u) => u.isBanned).length / totalUsers) * 100)
            : 0;

        const retention30 =
            totalUsers > 0
                ? Math.max(0, 100 - churnRate)
                : 0;

        return {
            totals: {
                users: totalUsers,
                activeUsers,
                adminUsers,
                events: totalEvents,
                activeEvents,
                resolvedEvents,
                bets: totalBets
            },
            revenue: {
                total: revenue,
                arppu,
                ltv,
                payingUsers
            },
            engagement: {
                engagementRate,
                creatorRate,
                participationRate,
                powerUsers,
                creators
            },
            growth: {
                recentUsers,
                recentEvents,
                recentResolvedEvents
            },
            categories: sortedCategories,
            chart,
            topUsers,
            health: {
                userRetention: retention30,
                eventSuccess:
                    totalEvents > 0 ? Math.round((resolvedEvents / totalEvents) * 100) : 0,
                creatorRatio: creatorRate,
                liquidity:
                    events.filter((e) => getEventBets(e) > 0).length > 0
                        ? Math.round(
                            (events.reduce((sum, e) => sum + getEventBets(e), 0) /
                                Math.max(1, events.filter((e) => getEventBets(e) > 0).length)) *
                                100
                        ) / 100
                        : 0,
                growthRate:
                    totalUsers > 0
                        ? Math.round((recentUsers / Math.max(1, totalUsers - recentUsers)) * 100)
                        : 0,
                churnRate
            }
        };
    }, [events, users]);

    const isLoading = usersLoading || eventsLoading;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold text-white">Admin dashboard</h2>
                <p className="text-sm text-gray-400">
                    Shadcn dashboard 01 layout — live snapshot of platform health.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Total users"
                    value={stats.totals.users}
                    helper={`Active ${stats.totals.activeUsers} · Admins ${stats.totals.adminUsers}`}
                    gradient="from-blue-500/20 to-indigo-500/10"
                />
                <StatCard
                    title="Total events"
                    value={stats.totals.events}
                    helper={`Active ${stats.totals.activeEvents} · Resolved ${stats.totals.resolvedEvents}`}
                    gradient="from-emerald-500/20 to-teal-500/10"
                />
                <StatCard
                    title="Total bets"
                    value={stats.totals.bets}
                    helper={`Engagement ${stats.engagement.engagementRate}%`}
                    gradient="from-amber-500/20 to-orange-500/10"
                />
                <StatCard
                    title="Revenue (mock)"
                    value={`$${stats.revenue.total.toFixed(2)}`}
                    helper={`ARPPU $${stats.revenue.arppu}`}
                    gradient="from-pink-500/20 to-rose-500/10"
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Engagement & growth</CardTitle>
                            <CardDescription>14-day pulse for daily users vs new users</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-blue-400" />
                                Daily users
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                New users
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="h-80">
                        {isLoading ? (
                            <div className="text-gray-400">Loading chart…</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.chart}>
                                    <defs>
                                        <linearGradient id="userArea" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.5} />
                                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="newUserArea" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.5} />
                                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                    <XAxis dataKey="date" stroke="#9ca3af" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#0b0f19',
                                            border: '1px solid #1f2937',
                                            borderRadius: 12
                                        }}
                                        labelStyle={{ color: '#fff' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="dailyUsers"
                                        stroke="#60a5fa"
                                        fill="url(#userArea)"
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="newUsers"
                                        stroke="#34d399"
                                        fill="url(#newUserArea)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Engagement quality</CardTitle>
                            <CardDescription>How users interact with markets</CardDescription>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-gray-400" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {isLoading ? (
                            <div className="text-gray-400">Loading…</div>
                        ) : (
                            <>
                                <HealthRow
                                    label="Bet engagement"
                                    value={`${stats.engagement.engagementRate}%`}
                                    tone="blue"
                                />
                                <HealthRow
                                    label="Creator engagement"
                                    value={`${stats.engagement.creatorRate}%`}
                                    tone="purple"
                                />
                                <HealthRow
                                    label="Event participation"
                                    value={`${stats.engagement.participationRate}%`}
                                    tone="emerald"
                                />
                                <HealthRow
                                    label="Power users"
                                    value={`${stats.engagement.powerUsers}`}
                                    tone="orange"
                                />
                                <HealthRow
                                    label="Creators"
                                    value={`${stats.engagement.creators}`}
                                    tone="pink"
                                />
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2 border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Top users</CardTitle>
                            <CardDescription>Leaders by betting activity</CardDescription>
                        </div>
                        <div className="text-xs text-gray-400">Sorted by total bets</div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-gray-400">Loading table…</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-white/5 text-gray-400">
                                        <tr>
                                            <th className="py-3 pr-3 font-medium">User</th>
                                            <th className="py-3 pr-3 font-medium">Bets</th>
                                            <th className="py-3 pr-3 font-medium">Events</th>
                                            <th className="py-3 pr-3 font-medium">Status</th>
                                            <th className="py-3 pr-3 font-medium">Joined</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {stats.topUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                                <td className="py-3 pr-3">
                                                    <div className="text-white font-semibold">{user.username}</div>
                                                    <div className="text-xs text-gray-400">{user.email || '—'}</div>
                                                </td>
                                                <td className="py-3 pr-3 text-blue-200 font-semibold">{user.bets}</td>
                                                <td className="py-3 pr-3 text-emerald-200 font-semibold">{user.events}</td>
                                                <td className="py-3 pr-3">
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span
                                                            className={`px-2 py-1 rounded-full border ${
                                                                user.isBanned
                                                                    ? 'border-red-500/40 text-red-200 bg-red-500/10'
                                                                    : 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10'
                                                            }`}
                                                        >
                                                            {user.isBanned ? 'Banned' : 'Active'}
                                                        </span>
                                                        {user.isAdmin && (
                                                            <span className="px-2 py-1 rounded-full border border-blue-500/40 text-blue-200 bg-blue-500/10">
                                                                Admin
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 pr-3 text-gray-300">
                                                    {format(new Date(user.createdAt), 'MMM d, yyyy')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Categories</CardTitle>
                            <CardDescription>Top active themes</CardDescription>
                        </div>
                        <BarChart2 className="h-5 w-5 text-gray-400" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {isLoading ? (
                            <div className="text-gray-400">Loading…</div>
                        ) : (
                            stats.categories.slice(0, 6).map((cat, idx) => {
                                const max = stats.categories[0]?.count || 1;
                                const width = Math.max((cat.count / max) * 100, 8);
                                return (
                                    <div key={cat.name} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm text-gray-200">
                                            <span className="flex items-center gap-2">
                                                <span className="text-gray-400">#{idx + 1}</span>
                                                {cat.name}
                                            </span>
                                            <span className="text-gray-400">{cat.count}</span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-white/5">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                                style={{ width: `${width}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Product health</CardTitle>
                            <CardDescription>Reliability + liquidity</CardDescription>
                        </div>
                        <LineChartIcon className="h-5 w-5 text-gray-400" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {isLoading ? (
                            <div className="text-gray-400">Loading…</div>
                        ) : (
                            <>
                                <HealthRow
                                    label="User retention"
                                    value={`${stats.health.userRetention}%`}
                                    tone="emerald"
                                />
                                <HealthRow
                                    label="Event success"
                                    value={`${stats.health.eventSuccess}%`}
                                    tone="blue"
                                />
                                <HealthRow
                                    label="Creator ratio"
                                    value={`${stats.health.creatorRatio}%`}
                                    tone="purple"
                                />
                                <HealthRow
                                    label="Market liquidity"
                                    value={`${stats.health.liquidity}`}
                                    tone="cyan"
                                />
                                <HealthRow
                                    label="Growth rate"
                                    value={`${stats.health.growthRate}%`}
                                    tone="pink"
                                />
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Revenue signals</CardTitle>
                            <CardDescription>Mock monetization view</CardDescription>
                        </div>
                        <Activity className="h-5 w-5 text-gray-400" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {isLoading ? (
                            <div className="text-gray-400">Loading…</div>
                        ) : (
                            <>
                                <HealthRow
                                    label="Total revenue"
                                    value={`$${stats.revenue.total.toFixed(2)}`}
                                    tone="orange"
                                />
                                <HealthRow label="ARPPU" value={`$${stats.revenue.arppu}`} tone="yellow" />
                                <HealthRow label="LTV (est.)" value={`$${stats.revenue.ltv}`} tone="purple" />
                                <HealthRow
                                    label="Paying users"
                                    value={`${stats.revenue.payingUsers}`}
                                    tone="blue"
                                />
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#0d0f14]">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div>
                            <CardTitle className="text-white">Retention</CardTitle>
                            <CardDescription>Who keeps coming back</CardDescription>
                        </div>
                        <Users className="h-5 w-5 text-gray-400" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {isLoading ? (
                            <div className="text-gray-400">Loading…</div>
                        ) : (
                            <>
                                <HealthRow
                                    label="30-day retention"
                                    value={`${stats.health.userRetention}%`}
                                    tone="emerald"
                                />
                                <HealthRow
                                    label="Recent users"
                                    value={`${stats.growth.recentUsers}`}
                                    tone="blue"
                                />
                                <HealthRow
                                    label="Recent events"
                                    value={`${stats.growth.recentEvents}`}
                                    tone="purple"
                                />
                                <HealthRow
                                    label="Recent resolutions"
                                    value={`${stats.growth.recentResolvedEvents}`}
                                    tone="cyan"
                                />
                                <HealthRow label="Churn" value={`${stats.health.churnRate}%`} tone="red" />
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

type StatCardProps = {
    title: string;
    value: number | string;
    helper: string;
    gradient: string;
};

function StatCard({ title, value, helper, gradient }: StatCardProps) {
    return (
        <div
            className={`rounded-xl border border-white/10 bg-gradient-to-br ${gradient} p-4 shadow-2xl shadow-black/20`}
        >
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-300">{title}</p>
                    <p className="text-2xl font-bold text-white">{value}</p>
                </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">{helper}</p>
        </div>
    );
}
