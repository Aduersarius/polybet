'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { sanitizeUrl } from '@/lib/utils';

interface SuggestedEventsProps {
    category: string;
    currentEventId: string;
}

export function SuggestedEvents({ category, currentEventId }: SuggestedEventsProps) {
    const [visibleCount, setVisibleCount] = useState(3);

    const { data: events, isLoading } = useQuery({
        queryKey: ['events', category],
        queryFn: async () => {
            const queryCategory = category === 'ALL' ? '' : category;
            const res = await fetch(`/api/events?category=${queryCategory}&limit=20`);
            if (!res.ok) throw new Error('Failed to fetch events');
            const data = await res.json();
            // Handle both array (legacy) and paginated response (new)
            return (Array.isArray(data) ? data : data.data) || [];
        },
    });

    if (isLoading) return <div className="animate-pulse h-40 bg-white/5 rounded-xl mt-6" />;

    // Filter out current event and exclude Sports/Esports events
    const sportsCategories = ['Sports', 'SPORTS', 'sports', 'Esports', 'ESPORTS', 'esports'];
    const allSuggestedEvents = events
        ?.filter((e: any) => {
            // Exclude current event
            if (e.id.toString() === currentEventId) return false;
            // Exclude Sports/Esports events
            if (e.categories?.some((cat: string) => sportsCategories.includes(cat))) return false;
            if (e.isEsports) return false;
            return true;
        }) || [];

    // Get visible events based on visibleCount
    const suggestedEvents = allSuggestedEvents.slice(0, visibleCount);
    const hasMore = allSuggestedEvents.length > visibleCount;

    if (!suggestedEvents?.length) return null;

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 3);
    };

    return (
        <div className="mt-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Related Markets</h3>
            <div className="space-y-3">
                {suggestedEvents.map((event: any) => (
                    <Link key={event.id} href={`/event/${event.slug || event.id}`} className="block group">
                        <motion.div
                            whileHover={{ borderColor: 'rgba(96, 165, 250, 0.4)' }}
                            transition={{ duration: 0.15 }}
                            className="bg-[#1a1d28] border border-white/10 rounded-lg p-3 hover:bg-[#232736] transition-colors flex gap-3 items-center"
                        >
                            <div className="w-12 h-12 rounded bg-gray-800 shrink-0 overflow-hidden">
                                {event.imageUrl ? (
                                    <img src={sanitizeUrl(event.imageUrl)} alt={event.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                                        {event.categories && event.categories.length > 0 ? event.categories[0][0] : '?'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                                    {event.title}
                                </h4>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {(() => {
                                        // Check if this is a multi-outcome event (MULTIPLE or GROUPED_BINARY)
                                        // Also check if outcomes exist and contain actual named outcomes (not just Yes/No)
                                        const isMultiOutcome = (event.type === 'MULTIPLE' || event.type === 'GROUPED_BINARY') &&
                                            event.outcomes &&
                                            event.outcomes.length > 0;

                                        // Additional check: if outcomes exist but are named "Yes"/"No", treat as binary
                                        const hasNamedOutcomes = event.outcomes?.some((o: any) =>
                                            o.name && !/^(yes|no)$/i.test(o.name.trim())
                                        );

                                        if (isMultiOutcome && hasNamedOutcomes) {
                                            const topOutcomes = event.outcomes.slice(0, 2);
                                            const remainingCount = event.outcomes.length - 2;
                                            const colors = [
                                                { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
                                                { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
                                            ];

                                            return (
                                                <>
                                                    {topOutcomes.map((outcome: any, idx: number) => {
                                                        const prob = outcome.probability > 1
                                                            ? Math.round(outcome.probability)
                                                            : Math.round(outcome.probability * 100);

                                                        return (
                                                            <div
                                                                key={outcome.id || idx}
                                                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${colors[idx % colors.length].bg} border ${colors[idx % colors.length].border}`}
                                                            >
                                                                <span className={`text-[10px] font-bold ${colors[idx % colors.length].text} truncate max-w-[60px]`}>
                                                                    {outcome.name}
                                                                </span>
                                                                <span className={`text-[10px] font-mono ${colors[idx % colors.length].text}`}>
                                                                    {prob}%
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                    {remainingCount > 0 && (
                                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-500/10 border border-gray-500/20">
                                                            <span className="text-[10px] font-bold text-gray-400">+{remainingCount}</span>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        }

                                        // For BINARY events, use yesOdds/noOdds from the event directly
                                        // API returns odds as percentages (e.g., 75 for 75%)
                                        // Use nullish check to properly handle 0% odds (0 is valid, not falsy)
                                        const yesOddsValue = event.yesOdds != null ? Number(event.yesOdds) : 50;
                                        const noOddsValue = event.noOdds != null ? Number(event.noOdds) : 50;

                                        // Display as-is since API already returns percentages
                                        const yesDisplay = Math.round(yesOddsValue);
                                        const noDisplay = Math.round(noOddsValue);

                                        return (
                                            <>
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#03dac6]/10 border border-[#03dac6]/20">
                                                    <span className="text-[10px] font-bold text-[#03dac6]">YES</span>
                                                    <span className="text-[10px] font-mono text-[#03dac6]">{yesDisplay}%</span>
                                                </div>
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#cf6679]/10 border border-[#cf6679]/20">
                                                    <span className="text-[10px] font-bold text-[#cf6679]">NO</span>
                                                    <span className="text-[10px] font-mono text-[#cf6679]">{noDisplay}%</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
                <button
                    onClick={handleLoadMore}
                    className="w-full py-2.5 px-4 bg-[#1a1d28] hover:bg-[#232736] border border-white/10 hover:border-blue-500/30 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
                >
                    <span>Load More</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            )}
        </div>
    );
}
