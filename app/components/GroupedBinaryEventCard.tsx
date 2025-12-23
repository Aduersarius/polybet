'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCategoryColorClasses } from '@/lib/colors';

interface DbEvent {
    id: string;
    title: string;
    description: string;
    category: string;
    categories?: string[];
    resolutionDate: string;
    createdAt: string;
    imageUrl?: string | null;
    volume?: number;
    betCount?: number;
    type?: string;
    outcomes?: Array<{
        id: string;
        name: string;
        probability: number;
        color?: string;
    }>;
}

interface GroupedBinaryEventCardProps {
    event: DbEvent;
    isEnded?: boolean;
    onSubBetTrade?: (event: DbEvent, outcomeId: string, outcomeName: string, option: 'YES' | 'NO') => void;
    onCategoryClick?: (category: string) => void;
    index?: number;
}

const getTimeRemaining = (endDate: Date) => {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 365) return `${Math.floor(days / 365)}y`;
    if (days > 30) return `${Math.floor(days / 30)}mo`;
    if (days > 0) return `${days}d`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return `${hours}h`;
};

export function GroupedBinaryEventCard({
    event,
    isEnded = false,
    onSubBetTrade,
    onCategoryClick,
    index = 0,
}: GroupedBinaryEventCardProps) {
    const queryClient = useQueryClient();

    // Fetch user's favorites
    const { data: userFavorites, refetch: refetchFavorites } = useQuery({
        queryKey: ['user-favorites'],
        queryFn: async () => {
            const res = await fetch('/api/user/favorites');
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || [];
        },
    });

    // Derive isFavorite from query data (avoids setState in useEffect)
    const isFavorite = userFavorites?.some((fav: any) => fav.id === event.id) ?? false;

    const toggleFavorite = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            if (isFavorite) {
                const res = await fetch(`/api/user/favorites?eventId=${event.id}`, { method: 'DELETE' });
                if (res.ok) {
                    refetchFavorites();
                    queryClient.invalidateQueries({ queryKey: ['favorite-events'] });
                }
            } else {
                const res = await fetch('/api/user/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: event.id }),
                });
                if (res.ok) {
                    refetchFavorites();
                    queryClient.invalidateQueries({ queryKey: ['favorite-events'] });
                }
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const handleSubBetClick = (e: React.MouseEvent, outcomeId: string, outcomeName: string, option: 'YES' | 'NO') => {
        e.preventDefault();
        e.stopPropagation();
        onSubBetTrade?.(event, outcomeId, outcomeName, option);
    };

    // Format volume
    const volume = event.volume
        ? event.volume >= 1000000
            ? `$${(event.volume / 1000000).toFixed(1)}m`
            : event.volume >= 1000
                ? `$${(event.volume / 1000).toFixed(1)}k`
                : `$${Math.round(event.volume)}`
        : '$0';

    const outcomes = event.outcomes || [];
    const endDate = new Date(event.resolutionDate);
    const timeRemaining = getTimeRemaining(endDate);
    const primaryCategory = event.categories?.[0] || event.category || 'General';
    const categoryColors = getCategoryColorClasses(primaryCategory);

    return (
        <Link href={`/event/${event.id}`} className="block">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className={`relative group rounded-2xl border border-white/10 bg-[#1e1e26] overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-300 ${isEnded ? 'opacity-60' : ''}`}
            >
                {/* Header: Image + Title + Favorite */}
                <div className="p-4 pb-2">
                    <div className="flex items-start gap-3">
                        {/* Event Image */}
                        <div className="relative shrink-0">
                            {event.imageUrl ? (
                                <img
                                    src={event.imageUrl}
                                    alt=""
                                    className="w-12 h-12 rounded-lg object-cover border border-white/10"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center">
                                    <span className="text-lg">🎯</span>
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white text-sm leading-tight line-clamp-2 group-hover:text-purple-300 transition-colors">
                                {event.title}
                            </h3>
                        </div>

                        {/* Favorite Button */}
                        <button
                            onClick={toggleFavorite}
                            className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <svg
                                className={`w-5 h-5 transition-colors ${isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-400 hover:text-red-400'}`}
                                fill={isFavorite ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Sub-bets List */}
                <div className="px-4 pb-2">
                    <div className="max-h-[180px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {outcomes.slice(0, 10).map((outcome, idx) => {
                            const probability = outcome.probability ?? 0;
                            const percentage = probability > 1 ? probability : Math.round(probability * 100);

                            return (
                                <div
                                    key={outcome.id || idx}
                                    className="flex items-center gap-2 py-2 border-b border-white/5 last:border-b-0"
                                >
                                    {/* Outcome Name */}
                                    <span className="flex-1 text-white text-sm font-medium truncate">
                                        {outcome.name}
                                    </span>

                                    {/* Percentage */}
                                    <span className="text-gray-300 text-sm font-bold min-w-[45px] text-right">
                                        {percentage}%
                                    </span>

                                    {/* YES Button */}
                                    <button
                                        onClick={(e) => handleSubBetClick(e, outcome.id, outcome.name, 'YES')}
                                        className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all"
                                    >
                                        Yes
                                    </button>

                                    {/* NO Button */}
                                    <button
                                        onClick={(e) => handleSubBetClick(e, outcome.id, outcome.name, 'NO')}
                                        className="px-3 py-1 text-xs font-bold rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all"
                                    >
                                        No
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Show more indicator if more than 10 outcomes */}
                    {outcomes.length > 10 && (
                        <div className="text-center py-1">
                            <span className="text-xs text-gray-500">+{outcomes.length - 10} more</span>
                        </div>
                    )}
                </div>

                {/* Footer: Volume + Time */}
                <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-gray-400 text-xs font-medium">
                        {volume} Vol.
                    </span>

                    <div className="flex items-center gap-3">
                        {/* Category badge */}
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase cursor-pointer hover:opacity-80 transition-opacity ${categoryColors}`}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCategoryClick?.(primaryCategory);
                            }}
                        >
                            {primaryCategory}
                        </span>

                        {/* Time remaining */}
                        <span className="text-gray-400 text-xs">
                            {timeRemaining}
                        </span>
                    </div>
                </div>

                {/* Grouped Binary indicator */}
                <div className="absolute top-2 right-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        🧩 {outcomes.length}
                    </span>
                </div>
            </motion.div>
        </Link>
    );
}
