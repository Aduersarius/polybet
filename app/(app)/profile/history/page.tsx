'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client'; // Changed from @clerk/nextjs
import { motion } from 'framer-motion';
import { Clock, ArrowLeft, Filter, Search } from 'lucide-react';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { useState } from 'react';

// Define Interface (matching ProfilePage)
interface BetHistory {
    id: string;
    eventId: string;
    eventTitle: string;
    option: 'YES' | 'NO' | string;
    amount: number;
    payout?: number;
    status: 'PENDING' | 'WON' | 'LOST';
    createdAt: string;
}

export default function HistoryPage() {
    const { data: session } = useSession();
    const user = (session as any)?.user;
    const [filter, setFilter] = useState<'ALL' | 'WON' | 'LOST' | 'PENDING'>('ALL');

    // Fetch betting history (Limit 100 for now, could be paginated)
    const { data: bets, isLoading } = useQuery<BetHistory[]>({
        queryKey: ['user-bets-full', user?.id],
        queryFn: async () => {
            // Using existing endpoint, maybe increase limit
            const res = await fetch('/api/user/bets?limit=100');
            if (!res.ok) throw new Error('Failed to fetch bets');
            return res.json();
        },
        enabled: !!user
    });

    const filteredBets = bets?.filter(bet => {
        if (filter === 'ALL') return true;
        return bet.status === filter;
    });

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
            <Navbar />

            <main className="max-w-5xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/profile" className="p-2 bg-[#1e1e1e] rounded-full hover:bg-white/10 transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-400" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Clock className="w-6 h-6 text-purple-400" />
                            Betting History
                        </h1>
                        <p className="text-gray-500 text-sm">Full record of your prediction market activity</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {(['ALL', 'PENDING', 'WON', 'LOST'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${filter === f
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                                : 'bg-[#1e1e1e] text-gray-400 hover:bg-[#2a2a2a]'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* List */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#1e1e1e] rounded-2xl border border-white/10 overflow-hidden min-h-[500px]"
                >
                    {isLoading ? (
                        <div className="p-12 text-center text-gray-500">Loading history...</div>
                    ) : (
                        <div className="divide-y divide-white/10">
                            {filteredBets && filteredBets.length > 0 ? (
                                filteredBets.map((bet) => (
                                    <Link
                                        href={`/event/${bet.eventId}`}
                                        key={bet.id}
                                        className="block p-4 hover:bg-white/5 transition-colors group"
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            {/* Event Info */}
                                            <div className="flex-1">
                                                <h3 className="font-medium text-white mb-1 group-hover:text-purple-400 transition-colors">
                                                    {bet.eventTitle}
                                                </h3>
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    <span>{new Date(bet.createdAt).toLocaleString()}</span>
                                                    <span className="w-1 h-1 bg-gray-700 rounded-full"></span>
                                                    <span>ID: {bet.id.slice(0, 8)}</span>
                                                </div>
                                            </div>

                                            {/* Bet Details */}
                                            <div className="flex items-center gap-6 shrink-0">
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500 mb-0.5">Prediction</div>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${bet.option === 'YES' ? 'bg-green-500/10 text-green-400' :
                                                        bet.option === 'NO' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                                                        }`}>
                                                        {bet.option}
                                                    </span>
                                                </div>

                                                <div className="text-right w-24">
                                                    <div className="text-xs text-gray-500 mb-0.5">Amount</div>
                                                    <div className="font-bold text-white">${bet.amount.toFixed(2)}</div>
                                                </div>

                                                <div className="text-right w-24">
                                                    <div className="text-xs text-gray-500 mb-0.5">Result</div>
                                                    {bet.status === 'PENDING' ? (
                                                        <span className="text-yellow-400 font-bold text-sm">PENDING</span>
                                                    ) : (
                                                        <div className={`font-bold text-sm ${bet.payout! > bet.amount ? 'text-green-400' : 'text-red-400'}`}>
                                                            {bet.payout! > bet.amount ? '+' : ''}${(bet.payout! - bet.amount).toFixed(2)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))
                            ) : (
                                <div className="p-12 text-center text-gray-500">
                                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No bets found for this filter.</p>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}
