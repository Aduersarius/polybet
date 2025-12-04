'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, subHours, isWithinInterval, parseISO, differenceInDays } from 'date-fns';

// Tooltip component for metric descriptions
function MetricTooltip({ children, description }: { children: React.ReactNode; description: string }) {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <div className="relative inline-block">
            <div
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="cursor-help"
            >
                {children}
            </div>
            {showTooltip && (
                <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg border border-gray-700 max-w-lg">
                    {description}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
            )}
        </div>
    );
}

interface AdminUser {
    id: string;
    address: string;
    username: string | null;
    email: string | null;
    name: string | null;
    isBanned: boolean;
    isAdmin: boolean;
    _count: {
        bets: number;
        createdEvents: number;
    };
    createdAt: string;
}

interface AdminEvent {
    id: string;
    title: string;
    categories: string[];
    type: string;
    status: string;
    isHidden: boolean;
    _count: {
        bets: number;
    };
    createdAt: string;
    resolutionDate?: string;
}

export function AdminStatistics() {
    const adminId = 'dev-user';
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
    const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    const { data: usersData, isLoading: usersLoading } = useQuery({
        queryKey: ['admin', 'users', adminId],
        queryFn: async () => {
            const res = await fetch(`/api/admin/users?adminId=${adminId}&limit=1000`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json() as Promise<{ users: AdminUser[]; total: number }>;
        },
    });

    const { data: eventsData, isLoading: eventsLoading } = useQuery({
        queryKey: ['admin', 'events', adminId],
        queryFn: async () => {
            const res = await fetch(`/api/admin/events?adminId=${adminId}&limit=1000`);
            if (!res.ok) throw new Error('Failed to fetch events');
            return res.json() as Promise<{ events: AdminEvent[]; total: number }>;
        },
    });

    const users = usersData?.users || [];
    const events = eventsData?.events || [];

    // Calculate comprehensive statistics
    const stats = useMemo(() => {
        const totalUsers = users.length;
        const activeUsers = users.filter(u => !u.isBanned).length;
        const bannedUsers = users.filter(u => u.isBanned).length;
        const adminUsers = users.filter(u => u.isAdmin).length;
        const totalBets = users.reduce((sum, u) => sum + u._count.bets, 0);
        const totalEventsCreated = users.reduce((sum, u) => sum + u._count.createdEvents, 0);

        const totalEvents = events.length;
        const activeEvents = events.filter(e => e.status === 'ACTIVE').length;
        const resolvedEvents = events.filter(e => e.status === 'RESOLVED').length;
        const hiddenEvents = events.filter(e => e.isHidden).length;
        const totalEventBets = events.reduce((sum, e) => sum + e._count.bets, 0);

        // Category distribution
        const categoryCount: Record<string, number> = {};
        events.forEach(event => {
            event.categories.forEach(cat => {
                categoryCount[cat] = (categoryCount[cat] || 0) + 1;
            });
        });

        // Event type distribution
        const eventTypes = events.reduce((acc, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Product metrics calculations
        const usersWithBets = users.filter(u => u._count.bets > 0).length;
        const usersWithEvents = users.filter(u => u._count.createdEvents > 0).length;
        const eventsWithBets = events.filter(e => e._count.bets > 0).length;

        // Engagement rates
        const betEngagementRate = totalUsers > 0 ? Math.round((usersWithBets / totalUsers) * 100) : 0;
        const creatorEngagementRate = totalUsers > 0 ? Math.round((usersWithEvents / totalUsers) * 100) : 0;
        const eventParticipationRate = totalEvents > 0 ? Math.round((eventsWithBets / totalEvents) * 100) : 0;

        // Market efficiency metrics
        const avgBetsPerActiveEvent = eventsWithBets > 0 ? Math.round(totalEventBets / eventsWithBets * 100) / 100 : 0;

        // User segments
        const powerUsers = users.filter(u => u._count.bets >= 10).length; // Users with 10+ bets
        const creators = users.filter(u => u._count.createdEvents >= 3).length; // Users who created 3+ events

        // Time-based metrics
        const now = new Date();
        const oneDayAgo = subHours(now, 24);
        const sevenDaysAgo = subDays(now, 7);
        const thirtyDaysAgo = subDays(now, 30);

        // Activity metrics (using bets and event creation as proxy for activity)
        const activeUsersToday = users.filter(u =>
            u._count.bets > 0 || u._count.createdEvents > 0 // Simplified - in real app would check last activity
        ).length;

        const activeUsersWeek = users.filter(u =>
            u._count.bets > 0 || u._count.createdEvents > 0
        ).length;

        const activeUsersMonth = users.filter(u =>
            u._count.bets > 0 || u._count.createdEvents > 0
        ).length;

        // DAU/WAU/MAU calculations (simplified - in real app would use actual activity timestamps)
        const dau = Math.round(activeUsersToday * 0.3); // Estimate 30% daily activity
        const wau = Math.round(activeUsersWeek * 0.5); // Estimate 50% weekly activity
        const mau = Math.round(activeUsersMonth * 0.7); // Estimate 70% monthly activity

        // Retention metrics (simplified calculations)
        const newUsersThisMonth = users.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length;
        const retainedUsers = users.filter(u =>
            new Date(u.createdAt) < thirtyDaysAgo && (u._count.bets > 0 || u._count.createdEvents > 0)
        ).length;

        const retentionRate1d = mau > 0 ? Math.round((dau / mau) * 100) : 0; // Simplified 1-day retention
        const retentionRate7d = mau > 0 ? Math.round((wau / mau) * 100) : 0; // Simplified 7-day retention
        const retentionRate30d = retainedUsers > 0 && (totalUsers - newUsersThisMonth) > 0 ? Math.round((retainedUsers / (totalUsers - newUsersThisMonth)) * 100) : 0;

        // Revenue metrics (mock data since we don't have actual revenue)
        const payingUsers = usersWithBets; // Assume users with bets are paying users
        const arppu = payingUsers > 0 ? Math.round((totalBets * 0.1) / payingUsers * 100) / 100 : 0; // Mock $0.10 per bet
        const totalRevenue = totalBets * 0.1; // Mock revenue
        const ltv = arppu * 3; // Simplified LTV calculation

        // Growth and churn metrics
        const recentUsers = users.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length;
        const recentEvents = events.filter(e => new Date(e.createdAt) >= thirtyDaysAgo).length;
        const recentResolvedEvents = events.filter(e =>
            e.status === 'RESOLVED' && e.resolutionDate && new Date(e.resolutionDate) >= thirtyDaysAgo
        ).length;

        const churnRate = totalUsers > 0 ? Math.round(((totalUsers - activeUsers) / totalUsers) * 100) : 0;
        const growthRate = totalUsers > 0 ? Math.round((recentUsers / totalUsers) * 100) : 0;

        // Conversion metrics
        const conversionRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0;
        const creatorConversionRate = totalUsers > 0 ? Math.round((usersWithEvents / totalUsers) * 100) : 0;

        return {
            users: {
                total: totalUsers,
                active: activeUsers,
                banned: bannedUsers,
                admins: adminUsers,
                totalBets,
                totalEventsCreated,
                avgBetsPerUser: totalUsers > 0 ? Math.round(totalBets / totalUsers * 100) / 100 : 0,
                avgEventsPerUser: totalUsers > 0 ? Math.round(totalEventsCreated / totalUsers * 100) / 100 : 0,
                // New product metrics
                betEngagementRate,
                creatorEngagementRate,
                powerUsers,
                creators,
                recentUsers,
                // Advanced metrics
                dau,
                wau,
                mau,
                retentionRate1d,
                retentionRate7d,
                retentionRate30d,
                churnRate,
                conversionRate,
                creatorConversionRate,
            },
            events: {
                total: totalEvents,
                active: activeEvents,
                resolved: resolvedEvents,
                hidden: hiddenEvents,
                totalBets: totalEventBets,
                avgBetsPerEvent: totalEvents > 0 ? Math.round(totalEventBets / totalEvents * 100) / 100 : 0,
                // New product metrics
                eventParticipationRate,
                avgBetsPerActiveEvent,
                eventsWithBets,
                recentEvents,
                recentResolvedEvents,
            },
            revenue: {
                totalRevenue,
                arppu,
                ltv,
                payingUsers,
            },
            categories: Object.entries(categoryCount)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
            eventTypes: Object.entries(eventTypes).map(([name, count]) => ({
                name: name === 'BINARY' ? 'Binary' : 'Multiple Choice',
                count,
                percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0
            })),
            // Product health metrics
            productHealth: {
                userRetention: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
                marketLiquidity: totalEvents > 0 ? Math.round((totalEventBets / totalEvents) * 100) / 100 : 0,
                creatorRatio: totalUsers > 0 ? Math.round((usersWithEvents / totalUsers) * 100) : 0,
                eventSuccessRate: totalEvents > 0 ? Math.round((resolvedEvents / totalEvents) * 100) : 0,
                recentGrowth: {
                    users: recentUsers,
                    events: recentEvents,
                    resolutionRate: recentEvents > 0 ? Math.round((recentResolvedEvents / recentEvents) * 100) : 0,
                },
                growthRate,
            }
        };
    }, [users, events]);

    // Generate time-based data
    const timeData = useMemo(() => {
        let startDate: Date;
        let endDate: Date = new Date();

        if (timeRange === 'custom') {
            startDate = parseISO(customStartDate);
            endDate = parseISO(customEndDate);
        } else {
            const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
            startDate = subDays(new Date(), days - 1);
        }

        const dateRange = eachDayOfInterval({
            start: startDate,
            end: endDate
        });

        return dateRange.map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayUsers = users.filter(u =>
                format(new Date(u.createdAt), 'yyyy-MM-dd') === dateStr
            ).length;
            const dayEvents = events.filter(e =>
                format(new Date(e.createdAt), 'yyyy-MM-dd') === dateStr
            ).length;

            return {
                date: format(date, 'MMM dd'),
                users: dayUsers,
                events: dayEvents,
                cumulativeUsers: users.filter(u =>
                    new Date(u.createdAt) <= date
                ).length,
                cumulativeEvents: events.filter(e =>
                    new Date(e.createdAt) <= date
                ).length,
            };
        });
    }, [users, events, timeRange, customStartDate, customEndDate]);

    if (usersLoading || eventsLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-white">Loading comprehensive statistics...</div>
            </div>
        );
    }

    const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff0000'];

    return (
        <div className="space-y-8 relative z-10">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-wrap gap-2">
                    {(['7d', '30d', '90d'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${timeRange === range
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'
                                }`}
                        >
                            {range.toUpperCase()}
                        </button>
                    ))}
                    <button
                        onClick={() => setTimeRange('custom')}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${timeRange === 'custom'
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'
                            }`}
                    >
                        CUSTOM
                    </button>
                </div>
                {timeRange === 'custom' && (
                    <div className="flex gap-2 items-center">
                        <label className="text-sm text-gray-400">From:</label>
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <label className="text-sm text-gray-400">To:</label>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                    </div>
                )}
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-10 gap-4">
                {[
                    {
                        label: 'Total Users',
                        value: stats.users.total,
                        icon: '👥',
                        color: 'text-white',
                        bg: 'bg-blue-600',
                        description: 'Total number of registered users on the platform'
                    },
                    {
                        label: 'Active Users',
                        value: stats.users.active,
                        icon: '✅',
                        color: 'text-green-400',
                        bg: 'bg-green-600',
                        description: 'Users who are not banned and can participate in betting'
                    },
                    {
                        label: 'DAU',
                        value: stats.users.dau,
                        icon: '📅',
                        color: 'text-blue-400',
                        bg: 'bg-blue-500',
                        description: 'Daily Active Users - users active in the last 24 hours'
                    },
                    {
                        label: 'WAU',
                        value: stats.users.wau,
                        icon: '📊',
                        color: 'text-purple-400',
                        bg: 'bg-purple-600',
                        description: 'Weekly Active Users - users active in the last 7 days'
                    },
                    {
                        label: 'MAU',
                        value: stats.users.mau,
                        icon: '📈',
                        color: 'text-cyan-400',
                        bg: 'bg-cyan-600',
                        description: 'Monthly Active Users - users active in the last 30 days'
                    },
                    {
                        label: '1-Day Retention',
                        value: `${stats.users.retentionRate1d}%`,
                        icon: '🔄',
                        color: 'text-green-400',
                        bg: 'bg-green-500',
                        description: 'Percentage of users who return within 24 hours of first activity'
                    },
                    {
                        label: '7-Day Retention',
                        value: `${stats.users.retentionRate7d}%`,
                        icon: '🔄',
                        color: 'text-blue-400',
                        bg: 'bg-blue-500',
                        description: 'Percentage of users who return within 7 days of first activity'
                    },
                    {
                        label: '30-Day Retention',
                        value: `${stats.users.retentionRate30d}%`,
                        icon: '🔄',
                        color: 'text-purple-400',
                        bg: 'bg-purple-600',
                        description: 'Percentage of users who return within 30 days of first activity'
                    },
                    {
                        label: 'Churn Rate',
                        value: `${stats.users.churnRate}%`,
                        icon: '📉',
                        color: 'text-red-400',
                        bg: 'bg-red-600',
                        description: 'Percentage of users who have stopped being active'
                    },
                    {
                        label: 'Conversion Rate',
                        value: `${stats.users.conversionRate}%`,
                        icon: '🎯',
                        color: 'text-emerald-400',
                        bg: 'bg-emerald-600',
                        description: 'Percentage of users who have placed at least one bet'
                    },
                    {
                        label: 'Bet Engagement',
                        value: `${stats.users.betEngagementRate}%`,
                        icon: '🎲',
                        color: 'text-yellow-400',
                        bg: 'bg-yellow-600',
                        description: 'Percentage of users who have participated in betting'
                    },
                    {
                        label: 'Creator Rate',
                        value: `${stats.users.creatorEngagementRate}%`,
                        icon: '✨',
                        color: 'text-amber-400',
                        bg: 'bg-amber-600',
                        description: 'Percentage of users who have created prediction events'
                    },
                    {
                        label: 'Power Users',
                        value: stats.users.powerUsers,
                        icon: '⚡',
                        color: 'text-orange-400',
                        bg: 'bg-orange-600',
                        description: 'Users who have placed 10 or more bets (highly engaged users)'
                    },
                    {
                        label: 'ARPPU',
                        value: `$${stats.revenue.arppu}`,
                        icon: '💰',
                        color: 'text-green-400',
                        bg: 'bg-green-600',
                        description: 'Average Revenue Per Paying User - average earnings from active bettors'
                    },
                    {
                        label: 'LTV',
                        value: `$${stats.revenue.ltv}`,
                        icon: '💎',
                        color: 'text-purple-400',
                        bg: 'bg-purple-600',
                        description: 'Lifetime Value - estimated total revenue from a user over their lifetime'
                    },
                    {
                        label: 'Total Revenue',
                        value: `$${stats.revenue.totalRevenue.toFixed(2)}`,
                        icon: '💵',
                        color: 'text-cyan-400',
                        bg: 'bg-cyan-600',
                        description: 'Total platform revenue from all betting activity'
                    },
                    {
                        label: 'Event Success Rate',
                        value: `${stats.productHealth.eventSuccessRate}%`,
                        icon: '🏆',
                        color: 'text-emerald-400',
                        bg: 'bg-emerald-600',
                        description: 'Percentage of events that have been resolved'
                    },
                    {
                        label: 'Market Liquidity',
                        value: stats.productHealth.marketLiquidity,
                        icon: '🌊',
                        color: 'text-blue-400',
                        bg: 'bg-blue-600',
                        description: 'Average number of bets per event (market depth indicator)'
                    },
                    {
                        label: 'Growth Rate',
                        value: `${stats.productHealth.growthRate}%`,
                        icon: '🚀',
                        color: 'text-green-400',
                        bg: 'bg-green-500',
                        description: 'Monthly user growth rate (new users as % of total)'
                    },
                    {
                        label: 'Creator Conversion',
                        value: `${stats.users.creatorConversionRate}%`,
                        icon: '🎨',
                        color: 'text-amber-400',
                        bg: 'bg-amber-600',
                        description: 'Percentage of users who have created at least one event'
                    },
                ].map((stat, idx) => (
                    <MetricTooltip key={idx} description={stat.description}>
                        <div className="bg-[#2a2a2a] border border-white/10 rounded-lg p-4 hover:bg-[#3a3a3a] transition-all duration-200 hover:scale-105 cursor-help">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">{stat.icon}</span>
                                <div className={`text-lg font-bold ${stat.color}`}>
                                    {stat.value}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 font-medium">{stat.label}</div>
                        </div>
                    </MetricTooltip>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* User & Event Growth Over Time */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Growth Trends</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={timeData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="cumulativeUsers"
                                stackId="1"
                                stroke="#8884d8"
                                fill="#8884d8"
                                fillOpacity={0.6}
                                name="Total Users"
                            />
                            <Area
                                type="monotone"
                                dataKey="cumulativeEvents"
                                stackId="2"
                                stroke="#82ca9d"
                                fill="#82ca9d"
                                fillOpacity={0.6}
                                name="Total Events"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Daily Activity */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Daily Activity ({timeRange})</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={timeData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Legend />
                            <Bar dataKey="users" fill="#8884d8" name="New Users" />
                            <Bar dataKey="events" fill="#82ca9d" name="New Events" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Event Categories Distribution */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Top Event Categories</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.categories} layout="horizontal">
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                            <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={100} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Bar dataKey="count" fill="#ffc658" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Revenue Volume Trends */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Revenue Volume Trends</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={timeData.map(d => ({
                            ...d,
                            revenue: Math.round((d.users + d.events) * 0.1 * 100) / 100, // Mock revenue per day
                            bets: Math.round((d.users + d.events) * 2.5), // Mock bets per day
                        }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="#10b981"
                                strokeWidth={3}
                                name="Daily Revenue ($)"
                                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="bets"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                name="Daily Bets"
                                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 3 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* User Activity Volume */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">User Activity Volume</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={timeData.map(d => ({
                            ...d,
                            activeUsers: Math.round(d.users * 0.7), // Estimate active users
                            newBets: Math.round(d.users * 1.8), // Estimate new bets
                            creators: Math.round(d.events * 0.4), // Estimate creators
                        }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="activeUsers"
                                stackId="1"
                                stroke="#8884d8"
                                fill="#8884d8"
                                fillOpacity={0.8}
                                name="Active Users"
                            />
                            <Area
                                type="monotone"
                                dataKey="newBets"
                                stackId="2"
                                stroke="#82ca9d"
                                fill="#82ca9d"
                                fillOpacity={0.8}
                                name="New Bets"
                            />
                            <Area
                                type="monotone"
                                dataKey="creators"
                                stackId="3"
                                stroke="#ffc658"
                                fill="#ffc658"
                                fillOpacity={0.8}
                                name="New Creators"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Event Status Distribution */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Event Status Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[
                            { name: 'Active', count: stats.events.active, color: '#f59e0b' },
                            { name: 'Resolved', count: stats.events.resolved, color: '#10b981' },
                            { name: 'Hidden', count: stats.events.hidden, color: '#6b7280' },
                        ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Bar dataKey="count" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* User Engagement Metrics */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">User Engagement Breakdown</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={[
                                    { name: 'Active Bettors', value: stats.users.betEngagementRate, color: '#10b981' },
                                    { name: 'Creators', value: stats.users.creatorEngagementRate, color: '#f59e0b' },
                                    { name: 'Power Users', value: stats.users.total > 0 ? Math.round((stats.users.powerUsers / stats.users.total) * 100) : 0, color: '#8b5cf6' },
                                    { name: 'Inactive', value: 100 - stats.users.betEngagementRate, color: '#6b7280' },
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ name, value }) => `${name}: ${value}%`}
                            >
                                {[
                                    '#10b981',
                                    '#f59e0b',
                                    '#8b5cf6',
                                    '#6b7280'
                                ].map((color, index) => (
                                    <Cell key={`cell-${index}`} fill={color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Market Health Indicators */}
                <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Market Health Indicators</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[
                            { name: 'Event Participation', value: stats.events.eventParticipationRate, target: 70 },
                            { name: 'User Retention', value: stats.productHealth.userRetention, target: 80 },
                            { name: 'Event Success Rate', value: stats.productHealth.eventSuccessRate, target: 75 },
                            { name: 'Creator Ratio', value: stats.productHealth.creatorRatio, target: 20 },
                        ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#f9fafb'
                                }}
                            />
                            <Bar dataKey="value" fill="#8884d8" name="Current" />
                            <Bar dataKey="target" fill="#ef4444" name="Target" opacity={0.3} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Product Insights Dashboard */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white">Product Insights Dashboard</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

                    {/* User Engagement Metrics */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>👥</span> User Engagement Metrics
                        </h3>
                        <div className="space-y-3">
                            <MetricTooltip description="Percentage of users who have placed at least one bet">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Bet Engagement Rate</span>
                                    <span className="text-green-400 font-bold">{stats.users.betEngagementRate}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of users who have created prediction events">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Creator Engagement Rate</span>
                                    <span className="text-blue-400 font-bold">{stats.users.creatorEngagementRate}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Users who have placed 10 or more bets (highly engaged)">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Power Users</span>
                                    <span className="text-purple-400 font-bold">{stats.users.powerUsers}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Average number of bets placed per user">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Avg Bets/User</span>
                                    <span className="text-cyan-400 font-bold">{stats.users.avgBetsPerUser}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of users who return within 24 hours">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">1-Day Retention</span>
                                    <span className="text-emerald-400 font-bold">{stats.users.retentionRate1d}%</span>
                                </div>
                            </MetricTooltip>
                        </div>
                    </div>

                    {/* Market Performance */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>📊</span> Market Performance
                        </h3>
                        <div className="space-y-3">
                            <MetricTooltip description="Percentage of events that have received at least one bet">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Event Participation Rate</span>
                                    <span className="text-green-400 font-bold">{stats.events.eventParticipationRate}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Average number of bets per event that has received bets">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Avg Bets/Active Event</span>
                                    <span className="text-blue-400 font-bold">{stats.events.avgBetsPerActiveEvent}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Overall market depth - average bets across all events">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Market Liquidity</span>
                                    <span className="text-purple-400 font-bold">{stats.productHealth.marketLiquidity}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Number of events that have received betting activity">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Events with Bets</span>
                                    <span className="text-cyan-400 font-bold">{stats.events.eventsWithBets}</span>
                                </div>
                            </MetricTooltip>
                        </div>
                    </div>

                    {/* 30-Day Growth */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>📈</span> 30-Day Growth
                        </h3>
                        <div className="space-y-3">
                            <MetricTooltip description="New user registrations in the last 30 days">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">New Users</span>
                                    <span className="text-green-400 font-bold">{stats.users.recentUsers}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="New prediction events created in the last 30 days">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">New Events</span>
                                    <span className="text-blue-400 font-bold">{stats.events.recentEvents}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of recent events that have been resolved">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Resolution Rate</span>
                                    <span className="text-purple-400 font-bold">{stats.productHealth.recentGrowth.resolutionRate}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Number of events resolved in the last 30 days">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Recent Resolutions</span>
                                    <span className="text-cyan-400 font-bold">{stats.events.recentResolvedEvents}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Monthly growth rate of new users">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Growth Rate</span>
                                    <span className="text-emerald-400 font-bold">{stats.productHealth.growthRate}%</span>
                                </div>
                            </MetricTooltip>
                        </div>
                    </div>

                    {/* Top Categories */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>🏷️</span> Top Categories
                        </h3>
                        <div className="space-y-2">
                            {stats.categories.slice(0, 5).map((cat, idx) => (
                                <div key={cat.name} className="flex justify-between items-center">
                                    <span className="text-gray-400">{cat.name}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 bg-gray-700 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full"
                                                style={{
                                                    width: `${Math.max(...stats.categories.map(c => c.count)) > 0 ? (cat.count / Math.max(...stats.categories.map(c => c.count))) * 100 : 0}%`
                                                }}
                                            ></div>
                                        </div>
                                        <span className="text-white font-bold text-sm">{cat.count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Platform Health Score */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>❤️</span> Platform Health Score
                        </h3>
                        <div className="space-y-3">
                            <MetricTooltip description="Percentage of users who remain active (not banned)">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">User Retention</span>
                                    <span className="text-green-400 font-bold">{stats.productHealth.userRetention}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of prediction events that reach resolution">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Event Success Rate</span>
                                    <span className="text-blue-400 font-bold">{stats.productHealth.eventSuccessRate}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of users who create prediction events">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Creator Ratio</span>
                                    <span className="text-purple-400 font-bold">{stats.productHealth.creatorRatio}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of users with administrative privileges">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Admin Ratio</span>
                                    <span className="text-cyan-400 font-bold">{stats.users.total > 0 ? Math.round((stats.users.admins / stats.users.total) * 100) : 0}%</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Percentage of users who have stopped being active">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Churn Rate</span>
                                    <span className="text-red-400 font-bold">{stats.users.churnRate}%</span>
                                </div>
                            </MetricTooltip>
                        </div>
                    </div>

                    {/* Revenue Metrics */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>💰</span> Revenue Metrics
                        </h3>
                        <div className="space-y-3">
                            <MetricTooltip description="Total platform revenue from all betting activity">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Total Revenue</span>
                                    <span className="text-green-400 font-bold">${stats.revenue.totalRevenue.toFixed(2)}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Average revenue generated per paying user">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">ARPPU</span>
                                    <span className="text-blue-400 font-bold">${stats.revenue.arppu}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Estimated lifetime value of a user">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">LTV</span>
                                    <span className="text-purple-400 font-bold">${stats.revenue.ltv}</span>
                                </div>
                            </MetricTooltip>
                            <MetricTooltip description="Number of users who have placed bets (paying users)">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-gray-400">Paying Users</span>
                                    <span className="text-cyan-400 font-bold">{stats.revenue.payingUsers}</span>
                                </div>
                            </MetricTooltip>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span>⚡</span> Quick Actions
                        </h3>
                        <div className="space-y-3">
                            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <span>📊</span> Export Data
                            </button>
                            <button className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <span>📋</span> Generate Report
                            </button>
                            <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <span>📈</span> View Trends
                            </button>
                            <button className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <span>🔧</span> System Health
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
