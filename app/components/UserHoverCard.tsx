'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserHoverCardProps {
    address: string;
    children: React.ReactNode;
    className?: string;
}

interface UserStats {
    username: string | null;
    avatarUrl: string | null;
    image: string | null; // Include image field from Better Auth
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
    const [coords, setCoords] = useState<{ x: number; y: number; placement: 'top' | 'bottom'; arrowX: number }>({ x: 0, y: 0, placement: 'top', arrowX: 150 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [mounted, setMounted] = useState(false);

    const isUnknownUser = !address || address.toLowerCase() === 'unknown';

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
        enabled: isOpen && !isUnknownUser,
        staleTime: 1000 * 60 * 5,
    });

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const cardWidth = 300;
            const triggerCenter = rect.left + rect.width / 2;

            let left = triggerCenter - cardWidth / 2;

            // Clamp to viewport with padding
            if (left < 10) left = 10;
            if (left + cardWidth > viewportWidth - 10) left = viewportWidth - cardWidth - 10;

            const arrowX = triggerCenter - left;

            const viewportHeight = window.innerHeight;
            const spaceAbove = rect.top;
            const showBelow = spaceAbove < 220;

            setCoords({
                x: left,
                y: showBelow ? rect.bottom + 12 : rect.top - 12,
                placement: showBelow ? 'bottom' : 'top',
                arrowX
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
                                y: coords.placement === 'top' ? "-100%" : 0
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                y: coords.placement === 'top' ? "-100%" : 0
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.95,
                                y: coords.placement === 'top' ? "-100%" : 0
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
                                {isUnknownUser ? (
                                    <div className="text-center text-gray-400 py-4">
                                        User information is not available
                                    </div>
                                ) : isLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-[#bb86fc] border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : user ? (
                                    <>
                                        {/* Header */}
                                        <Link href={`/profile?address=${address}`} className="flex items-center gap-3 mb-4">
                                            <Avatar className="w-12 h-12 border-2 border-white/10">
                                                {(user.avatarUrl || user.image) && (
                                                    <AvatarImage 
                                                        src={user.avatarUrl || user.image || undefined} 
                                                        alt={user.username || formatAddress(address)}
                                                    />
                                                )}
                                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-lg">
                                                    {(user.username?.[0] || address.slice(2, 3)).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <h3 className="font-bold text-white text-lg leading-tight">
                                                    {user.username || formatAddress(address)}
                                                </h3>
                                                <p className="text-gray-400 text-xs">
                                                    Joined {formatDate(user.joinedAt)}
                                                </p>
                                            </div>
                                        </Link>

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
                                style={{ left: coords.arrowX }}
                                className={`absolute -translate-x-1/2 w-3 h-3 bg-[#1e293b] rotate-45 ${coords.placement === 'top'
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
