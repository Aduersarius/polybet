'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import { useSession } from '@/lib/auth-client';

interface Position {
    eventId: string;
    eventTitle: string;
    option: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
}

export function PositionsDropdown() {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const queryClient = useQueryClient();

    const { data: positions = [], isLoading } = useQuery<Position[]>({
        queryKey: ['user-positions', (session as any)?.user?.id],
        queryFn: async () => {
            if (!(session as any)?.user?.id) return [];
            const res = await fetch('/api/user/positions');
            if (!res.ok) throw new Error('Failed to fetch positions');
            return res.json();
        },
        enabled: !!(session as any)?.user?.id,
        // refetchInterval: 15000, // Removed in favor of WebSockets
    });

    // Real-time updates via WebSocket
    useEffect(() => {
        if (!(session as any)?.user?.id) return;

        const { socket } = require('@/lib/socket');
        const userId = (session as any).user.id;

        function onUserUpdate(update: any) {
            if (update.type === 'POSITION_UPDATE') {
                queryClient.invalidateQueries({ queryKey: ['user-positions', userId] });
            }
        }

        // Join user-specific room
        socket.emit('join-user-room', userId);
        socket.on('user-update', onUserUpdate);

        return () => {
            socket.emit('leave-user-room', userId);
            socket.off('user-update', onUserUpdate);
        };
    }, [(session as any)?.user?.id, queryClient]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const totalValue = positions.reduce((sum, p) => sum + (p.shares * p.currentPrice), 0);
    const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium transition-colors border border-blue-500/20"
            >
                <Briefcase className="w-4 h-4" />
                Portfolio
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 mt-2 w-80 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50"
                    >
                        <div className="p-3 border-b border-white/10 bg-white/5">
                            <div className="flex justify-between items-center mb-1">
                                <h3 className="text-sm font-bold text-white">Your Positions</h3>
                                <span className="text-xs text-gray-400">{positions.length} Active</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-xs text-gray-400">Total Value</p>
                                    <p className="text-lg font-bold text-white">${totalValue.toFixed(2)}</p>
                                </div>
                                <div className={`text-right ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    <p className="text-xs text-gray-400">Total P&L</p>
                                    <p className="text-sm font-bold flex items-center gap-1">
                                        {totalPnL >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        ${Math.abs(totalPnL).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {isLoading ? (
                                <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
                            ) : positions.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    No active positions
                                </div>
                            ) : (
                                positions.map((position, idx) => (
                                    <Link
                                        key={`${position.eventId}-${position.option}-${idx}`}
                                        href={`/event/${position.eventId}`}
                                        onClick={() => setIsOpen(false)}
                                        className="block p-3 border-b border-white/5 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="text-sm font-medium text-white line-clamp-2 flex-1 mr-2">
                                                {position.eventTitle}
                                            </p>
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${position.option === 'YES' ? 'bg-green-500/20 text-green-400' :
                                                position.option === 'NO' ? 'bg-red-500/20 text-red-400' :
                                                    'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {position.option}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span>{position.shares.toFixed(1)} shares @ ${(position.avgPrice * 100).toFixed(1)}¢</span>
                                            <span className={position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnL.toFixed(2)}
                                            </span>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
