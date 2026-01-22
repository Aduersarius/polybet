'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, Medal, Crown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Navbar } from '@/app/components/Navbar';
import { Footer } from '@/app/components/Footer';
import Link from 'next/link';

type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

interface LeaderboardEntry {
    rank: number;
    id: string;
    name: string;
    avatar?: string;
    profit: number;
    volume: number;
    winRate: number;
    trades: number;
    isReal?: boolean;
}

// Deterministic seeded random number generator
function seededRandom(seed: number) {
    let value = seed;
    return () => {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
}

// Generate deterministic hash from string
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Generate fake but realistic leaderboard data (deterministic)
function generateFakeLeaderboard(period: TimePeriod): LeaderboardEntry[] {
    const fakeUsers = [
        { name: 'CryptoWizard', avatar: null },
        { name: 'MarketMaven', avatar: null },
        { name: 'TradingPro99', avatar: null },
        { name: 'AlphaSeeker', avatar: null },
        { name: 'BullishBear', avatar: null },
        { name: 'PredictorX', avatar: null },
        { name: 'OddsHunter', avatar: null },
        { name: 'SmartMoney_', avatar: null },
        { name: 'RiskTaker21', avatar: null },
        { name: 'ChartMaster', avatar: null },
        { name: 'DataDriven', avatar: null },
        { name: 'TrendSpotter', avatar: null },
        { name: 'ValueFinder', avatar: null },
        { name: 'EdgeSeeker', avatar: null },
        { name: 'ProbabilityPro', avatar: null },
        { name: 'Analyst_K', avatar: null },
        { name: 'MarketNinja', avatar: null },
        { name: 'ProfitHunter', avatar: null },
        { name: 'InsightTrader', avatar: null },
        { name: 'WinStreak', avatar: null },
        { name: 'QuantTrader', avatar: null },
        { name: 'BetWise', avatar: null },
        { name: 'OddsBeater', avatar: null },
        { name: 'SharpMoney', avatar: null },
        { name: 'InfoEdge', avatar: null },
    ];

    // Multipliers based on time period for realistic scaling (much lower for trustworthiness)
    const multipliers: Record<TimePeriod, { profit: number; volume: number; trades: number }> = {
        today: { profit: 1, volume: 1, trades: 1 },
        week: { profit: 3, volume: 4, trades: 5 },
        month: { profit: 8, volume: 12, trades: 15 },
        year: { profit: 35, volume: 50, trades: 80 },
        all: { profit: 60, volume: 90, trades: 150 },
    };

    const mult = multipliers[period];

    // Deterministic shuffle based on period
    const seed = hashString(period);
    const random = seededRandom(seed);
    const shuffled = [...fakeUsers].sort((a, b) => {
        const hashA = hashString(a.name + period);
        const hashB = hashString(b.name + period);
        return hashA - hashB;
    });
    
    return shuffled.slice(0, 20).map((user, index) => {
        // Deterministic values based on user name and period
        const userSeed = hashString(user.name + period);
        const userRandom = seededRandom(userSeed);
        
        // Top traders have higher profits, exponential decay
        // Reduced base profit range: $15-120 (much more realistic for single bets)
        const rankFactor = Math.pow(0.8, index);
        const baseProfit = (userRandom() * 105 + 15) * rankFactor;
        // Volume is 2-4x profit (realistic trading ratio)
        const baseVolume = baseProfit * (2 + userRandom() * 2);
        const baseTrades = Math.floor(userRandom() * 12 + 3);

        return {
            rank: index + 1,
            id: `fake-${user.name.toLowerCase()}-${period}-${index}`,
            name: user.name,
            avatar: user.avatar || undefined,
            profit: Math.round(baseProfit * mult.profit * 100) / 100,
            volume: Math.round(baseVolume * mult.volume * 100) / 100,
            winRate: Math.round((55 + userRandom() * 30) * 10) / 10,
            trades: Math.floor(baseTrades * mult.trades),
            isReal: false,
        };
    }).sort((a, b) => b.profit - a.profit).map((entry, index) => ({
        ...entry,
        rank: index + 1,
    }));
}

// Format currency with K/M suffix
function formatCurrency(value: number): string {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
}

// Get rank badge styling
function getRankBadge(rank: number) {
    if (rank === 1) return { icon: Crown, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' };
    if (rank === 2) return { icon: Medal, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30' };
    if (rank === 3) return { icon: Medal, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' };
    return null;
}

// Generate avatar gradient from name
function getAvatarGradient(name: string): string {
    const gradients = [
        'from-blue-500 to-purple-500',
        'from-emerald-500 to-teal-500',
        'from-purple-500 to-pink-500',
        'from-pink-500 to-rose-500',
        'from-indigo-500 to-blue-500',
        'from-violet-500 to-purple-500',
        'from-cyan-500 to-blue-500',
        'from-blue-600 to-indigo-600',
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length;
    return gradients[index];
}

export default function LeaderboardPage() {
    const [period, setPeriod] = useState<TimePeriod>('month');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<'profit' | 'volume'>('profit');
    const itemsPerPage = 10;

    // Generate leaderboard data (memoized to prevent re-generation on every render)
    const leaderboard = useMemo(() => generateFakeLeaderboard(period), [period]);

    // Filter and sort
    const filteredLeaderboard = useMemo(() => {
        let result = [...leaderboard];
        
        if (searchQuery) {
            result = result.filter(entry => 
                entry.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (sortBy === 'volume') {
            result.sort((a, b) => b.volume - a.volume);
            result = result.map((entry, index) => ({ ...entry, rank: index + 1 }));
        }

        return result;
    }, [leaderboard, searchQuery, sortBy]);

    // Pagination
    const totalPages = Math.ceil(filteredLeaderboard.length / itemsPerPage);
    const paginatedLeaderboard = filteredLeaderboard.slice(
        (page - 1) * itemsPerPage,
        page * itemsPerPage
    );

    // Top 3 for podium display
    const topThree = filteredLeaderboard.slice(0, 3);

    const periods: { id: TimePeriod; label: string }[] = [
        { id: 'today', label: 'Today' },
        { id: 'week', label: 'Weekly' },
        { id: 'month', label: 'Monthly' },
        { id: 'year', label: 'Yearly' },
        { id: 'all', label: 'All Time' },
    ];

    return (
        <div className="min-h-screen text-white">
            <Navbar />
            
            <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-4">
                            <Trophy className="w-5 h-5 text-blue-400" />
                            <span className="text-sm font-semibold text-blue-400">Top Traders</span>
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-white">
                            Leaderboard
                        </h1>
                        <p className="text-white/60 text-lg max-w-2xl mx-auto">
                            See who's leading the pack. Track top performers and compete for the top spots.
                        </p>
                    </div>

                    {/* Top 3 Podium */}
                    <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-10 max-w-3xl mx-auto">
                        {/* 2nd Place */}
                        {topThree[1] && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="order-1 mt-6"
                            >
                                <div className="bg-[#1a1d28] border border-white/5 rounded-2xl p-4 sm:p-6 text-center relative">
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-[#1a1d28] border border-purple-400/30 rounded-full flex items-center justify-center">
                                        <span className="text-purple-400 font-bold text-sm">2</span>
                                    </div>
                                    <div className={`w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-gradient-to-br ${getAvatarGradient(topThree[1].name)} flex items-center justify-center text-white font-bold text-xl mb-3`}>
                                        {topThree[1].name.charAt(0)}
                                    </div>
                                    <p className="font-semibold text-white text-sm sm:text-base truncate">{topThree[1].name}</p>
                                    <p className="text-emerald-400 font-bold text-lg sm:text-xl mt-1">+{formatCurrency(topThree[1].profit)}</p>
                                    <p className="text-white/50 text-xs mt-1">{formatCurrency(topThree[1].volume)} vol</p>
                                </div>
                            </motion.div>
                        )}

                        {/* 1st Place */}
                        {topThree[0] && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="order-2"
                            >
                                <div className="bg-[#1a1d28] border border-blue-500/20 rounded-2xl p-4 sm:p-6 text-center relative">
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                                        <Crown className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <div className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-gradient-to-br ${getAvatarGradient(topThree[0].name)} flex items-center justify-center text-white font-bold text-2xl mb-3 ring-2 ring-blue-400/30`}>
                                        {topThree[0].name.charAt(0)}
                                    </div>
                                    <p className="font-bold text-white text-base sm:text-lg truncate">{topThree[0].name}</p>
                                    <p className="text-emerald-400 font-bold text-xl sm:text-2xl mt-1">+{formatCurrency(topThree[0].profit)}</p>
                                    <p className="text-white/50 text-xs mt-1">{formatCurrency(topThree[0].volume)} vol</p>
                                </div>
                            </motion.div>
                        )}

                        {/* 3rd Place */}
                        {topThree[2] && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="order-3 mt-8"
                            >
                                <div className="bg-[#1a1d28] border border-white/5 rounded-2xl p-4 sm:p-6 text-center relative">
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-[#1a1d28] border border-emerald-400/30 rounded-full flex items-center justify-center">
                                        <span className="text-emerald-400 font-bold text-sm">3</span>
                                    </div>
                                    <div className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-gradient-to-br ${getAvatarGradient(topThree[2].name)} flex items-center justify-center text-white font-bold text-lg mb-3`}>
                                        {topThree[2].name.charAt(0)}
                                    </div>
                                    <p className="font-semibold text-white text-sm truncate">{topThree[2].name}</p>
                                    <p className="text-emerald-400 font-bold text-base sm:text-lg mt-1">+{formatCurrency(topThree[2].profit)}</p>
                                    <p className="text-white/50 text-xs mt-1">{formatCurrency(topThree[2].volume)} vol</p>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="bg-[#1a1d28] border border-white/5 rounded-2xl p-4 sm:p-6 mb-6">
                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                            {/* Time Period Tabs */}
                            <div className="flex flex-wrap gap-2">
                                {periods.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setPeriod(p.id); setPage(1); }}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                            period === p.id
                                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {/* Sort Toggle */}
                            <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1">
                                <button
                                    onClick={() => setSortBy('profit')}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                        sortBy === 'profit'
                                            ? 'bg-white/10 text-white'
                                            : 'text-white/60 hover:text-white'
                                    }`}
                                >
                                    Profit
                                </button>
                                <button
                                    onClick={() => setSortBy('volume')}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                        sortBy === 'volume'
                                            ? 'bg-white/10 text-white'
                                            : 'text-white/60 hover:text-white'
                                    }`}
                                >
                                    Volume
                                </button>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="mt-4 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                            <input
                                type="text"
                                placeholder="Search traders..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/5 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Leaderboard Table */}
                    <div className="bg-[#1a1d28] border border-white/5 rounded-2xl overflow-hidden">
                        {/* Table Header */}
                        <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 bg-white/5 border-b border-white/5 text-sm font-medium text-white/60">
                            <div className="col-span-1">#</div>
                            <div className="col-span-4">Trader</div>
                            <div className="col-span-2 text-right">Profit/Loss</div>
                            <div className="col-span-2 text-right">Volume</div>
                            <div className="col-span-2 text-right">Win Rate</div>
                            <div className="col-span-1 text-right">Trades</div>
                        </div>

                        {/* Table Body */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${period}-${sortBy}-${page}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                {paginatedLeaderboard.map((entry, index) => {
                                    const badge = getRankBadge(entry.rank);
                                    const isTopThree = entry.rank <= 3;

                                    return (
                                        <motion.div
                                            key={entry.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.03 }}
                                            className={`grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors items-center`}
                                        >
                                            {/* Rank */}
                                            <div className="col-span-2 sm:col-span-1">
                                                {badge ? (
                                                    <div className={`w-8 h-8 rounded-full ${badge.bg} border ${badge.border} flex items-center justify-center`}>
                                                        <span className={`${badge.color} font-bold text-sm`}>{entry.rank}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-white/60 font-medium">{entry.rank}</span>
                                                )}
                                            </div>

                                            {/* Trader */}
                                            <div className="col-span-10 sm:col-span-4 flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(entry.name)} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                                                    {entry.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-white truncate">{entry.name}</p>
                                                    <div className="sm:hidden flex items-center gap-3 text-xs text-white/50 mt-0.5">
                                                        <span className="text-emerald-400 font-medium">+{formatCurrency(entry.profit)}</span>
                                                        <span>{formatCurrency(entry.volume)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Profit */}
                                            <div className="hidden sm:block col-span-2 text-right">
                                                <span className="text-emerald-400 font-semibold">+{formatCurrency(entry.profit)}</span>
                                            </div>

                                            {/* Volume */}
                                            <div className="hidden sm:block col-span-2 text-right text-white/70">
                                                {formatCurrency(entry.volume)}
                                            </div>

                                            {/* Win Rate */}
                                            <div className="hidden sm:block col-span-2 text-right">
                                                <span className={`font-medium ${entry.winRate >= 60 ? 'text-emerald-400' : entry.winRate >= 50 ? 'text-white' : 'text-red-400'}`}>
                                                    {entry.winRate}%
                                                </span>
                                            </div>

                                            {/* Trades */}
                                            <div className="hidden sm:block col-span-1 text-right text-white/60">
                                                {entry.trades}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        </AnimatePresence>

                        {/* Empty State */}
                        {paginatedLeaderboard.length === 0 && (
                            <div className="py-16 text-center">
                                <Trophy className="w-12 h-12 text-white/30 mx-auto mb-4" />
                                <p className="text-white/60">No traders found matching your search.</p>
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/60 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Previous
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                                page === p
                                                    ? 'bg-blue-500 text-white'
                                                    : 'text-white/60 hover:text-white hover:bg-white/10'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/60 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* CTA Section */}
                    <div className="mt-10 text-center">
                        <div className="bg-[#1a1d28] border border-white/5 rounded-2xl p-8">
                            <h2 className="text-2xl font-bold mb-3 text-white">Ready to compete?</h2>
                            <p className="text-white/60 mb-6 max-w-xl mx-auto">
                                Start trading on prediction markets and climb the leaderboard. The top performers earn bragging rights and future rewards.
                            </p>
                            <Link
                                href="/"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/25"
                            >
                                <TrendingUp className="w-5 h-5" />
                                Start Trading
                            </Link>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
