'use client';

import { createPortal } from 'react-dom';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

interface UserHoverCardProps {
    address: string;
    children: React.ReactNode;
    className?: string;
}

interface UserStats {
    username: string | null;
    avatarUrl: string | null;
    joinedAt: string;
    stats: {
        volume: number;
        profit: number;
        positions: number;
        betCount: number;
    };
}

export function UserHoverCard({ address, children, className = '' }: UserHoverCardProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState<{ x: number; y: number; placement: 'top' | 'bottom' }>({ x: 0, y: 0, placement: 'top' });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data: user, isLoading } = useQuery<UserStats>({
        queryKey: ['user', address, 'stats'],
        queryFn: async () => {
            const res = await fetch(`/api/users/${address}/stats`);
            if (!res.ok) throw new Error('Failed to fetch user stats');
            return res.json();
        },
        enabled: isOpen,
        staleTime: 1000 * 60 * 5,
    });

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceAbove = rect.top;
            // const spaceBelow = viewportHeight - rect.bottom;

            // Prefer top, but flip if not enough space (need ~200px)
            const showBelow = spaceAbove < 220;

            setCoords({
                x: rect.left + rect.width / 2,
                y: showBelow ? rect.bottom + 12 : rect.top - 12, // Increased gap slightly
                placement: showBelow ? 'bottom' : 'top'
            });
        }
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 300);
    };

    const formatCurrency = (val: number) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}m`;
        if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
        return `$${Math.round(val)}`;
    };

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    return (
        <>
            <div
                ref={triggerRef}
                className={`relative inline-block ${className}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {children}
            </div>

            {mounted && isOpen && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0.95,
                                x: "-50%",
                                y: coords.placement === 'top' ? "-90%" : 10
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                x: "-50%",
                                y: coords.placement === 'top' ? "-100%" : 0
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.95,
                                x: "-50%",
                                y: coords.placement === 'top' ? "-90%" : 10
                            }}
                            transition={{ duration: 0.2 }}
                            style={{
                                position: 'fixed',
                                left: coords.x,
                                top: coords.y,
                                zIndex: 9999,
                            }}
                            className="w-[300px]"
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                        >
                            <div className="bg-[#1e293b] rounded-xl shadow-2xl border border-white/10 overflow-hidden p-4">
                                {isLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-[#bb86fc] border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : user ? (
                                    <>
                                        {/* Header */}
                                        <div className="flex items-center gap-3 mb-4">
                                            {user.avatarUrl ? (
                                                <img
                                                    src={user.avatarUrl}
                                                    alt={user.username || 'User'}
                                                    className="w-12 h-12 rounded-full object-cover border-2 border-white/10"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white border-2 border-white/10">
                                                    {(user.username?.[0] || address.slice(2, 3)).toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-white text-lg leading-tight">
                                                    {user.username || formatAddress(address)}
                                                </h3>
                                                <p className="text-gray-400 text-xs">
                                                    Joined {formatDate(user.joinedAt)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/5">
                                            <div>
                                                <div className="text-white font-bold text-lg">
                                                    {formatCurrency(user.stats.positions)}
                                                </div>
                                                <div className="text-gray-400 text-xs">Positions</div>
                                            </div>
                                            <div>
                                                <div className={`font-bold text-lg ${user.stats.profit >= 0 ? 'text-[#03dac6]' : 'text-[#cf6679]'}`}>
                                                    {user.stats.profit >= 0 ? '+' : ''}{formatCurrency(user.stats.profit)}
                                                </div>
                                                <div className="text-gray-400 text-xs">Profit/loss</div>
                                            </div>
                                            <div>
                                                <div className="text-white font-bold text-lg">
                                                    {formatCurrency(user.stats.volume)}
                                                </div>
                                                <div className="text-gray-400 text-xs">Volume</div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-gray-400 py-4">
                                        User not found
                                    </div>
                                )}
                            </div>

                            {/* Arrow */}
                            <div
                                className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1e293b] rotate-45 ${coords.placement === 'top'
                                    ? 'bottom-[-6px] border-r border-b border-white/10'
                                    : 'top-[-6px] border-l border-t border-white/10'
                                    }`}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}
