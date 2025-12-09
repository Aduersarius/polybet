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

            <main className="max-w-5xl mx-auto px-4 py-8 relative z-10">
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

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#1e1e1e] rounded-2xl border border-white/10 overflow-hidden min-h-[500px]"
                    style={{ backgroundColor: '#1e1e1e' }}
                >
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/10 text-xs font-bold text-gray-500 uppercase tracking-wider bg-[#1a1b26]/50">
                        <div className="col-span-5">Event</div>
                        <div className="col-span-2 text-center">Prediction</div>
                        <div className="col-span-2 text-right">Stake</div>
                        <div className="col-span-2 text-right">Return</div>
                        <div className="col-span-1 text-right">Status</div>
                    </div>
                    {isLoading ? (
                        <div className="p-12 text-center text-gray-500">Loading history...</div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {filteredBets && filteredBets.length > 0 ? (
                                filteredBets.map((bet) => (
                                    <Link
                                        href={`/event/${bet.eventId}`}
                                        key={bet.id}
                                        className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-white/5 transition-colors group items-center"
                                    >
                                        {/* Event Info */}
                                        <div className="col-span-5">
                                            <h3 className="font-medium text-white mb-1 group-hover:text-purple-400 transition-colors truncate pr-4">
                                                {bet.eventTitle}
                                            </h3>
                                            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                                                <span>{new Date(bet.createdAt).toLocaleDateString()}</span>
                                                <span>•</span>
                                                <span>{new Date(bet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>

                                        {/* Prediction */}
                                        <div className="col-span-2 flex justify-center">
                                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-opacity-20 ${bet.option === 'YES' ? 'bg-green-500/10 text-green-400 border-green-500' :
                                                bet.option === 'NO' ? 'bg-red-500/10 text-red-400 border-red-500' : 'bg-blue-500/10 text-blue-400 border-blue-500'
                                                }`}>
                                                {bet.option}
                                            </span>
                                        </div>

                                        {/* Stake */}
                                        <div className="col-span-2 text-right">
                                            <div className="font-medium text-white font-mono">${bet.amount.toFixed(2)}</div>
                                        </div>

                                        {/* Return / PnL */}
                                        <div className="col-span-2 text-right">
                                            {bet.status === 'PENDING' ? (
                                                <span className="text-gray-600 font-mono">-</span>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <span className={`font-mono font-medium ${bet.payout! > bet.amount ? 'text-green-400' : 'text-gray-400'}`}>
                                                        ${bet.payout?.toFixed(2) || '0.00'}
                                                    </span>
                                                    <span className={`text-xs ${bet.payout! > bet.amount ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                                        {bet.payout! > bet.amount ? '+' : ''}{(bet.payout! - bet.amount).toFixed(2)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Status */}
                                        <div className="col-span-1 text-right">
                                            {bet.status === 'PENDING' ? (
                                                <div className="flex items-center justify-end gap-1.5 text-yellow-400/80 text-xs font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                                    Pending
                                                </div>
                                            ) : bet.status === 'WON' ? (
                                                <div className="text-green-400 text-xs font-bold tracking-wider">WON</div>
                                            ) : (
                                                <div className="text-gray-500 text-xs font-bold tracking-wider">LOST</div>
                                            )}
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
