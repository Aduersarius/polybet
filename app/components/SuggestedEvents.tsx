'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface SuggestedEventsProps {
    category: string;
    currentEventId: string;
}

export function SuggestedEvents({ category, currentEventId }: SuggestedEventsProps) {
    const { data: events, isLoading } = useQuery({
        queryKey: ['events', category],
        queryFn: async () => {
            const queryCategory = category === 'ALL' ? '' : category;
            const res = await fetch(`/api/events?category=${queryCategory}`);
            if (!res.ok) throw new Error('Failed to fetch events');
            const data = await res.json();
            // Handle both array (legacy) and paginated response (new)
            return (Array.isArray(data) ? data : data.data) || [];
        },
    });

    if (isLoading) return <div className="animate-pulse h-40 bg-white/5 rounded-xl mt-6" />;

    // Filter out current event and limit to 3
    const suggestedEvents = events
        ?.filter((e: any) => e.id.toString() !== currentEventId)
        .slice(0, 3);

    if (!suggestedEvents?.length) return null;

    return (
        <div className="mt-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Related Markets</h3>
            <div className="space-y-3">
                {suggestedEvents.map((event: any) => (
                    <Link key={event.id} href={`/event/${event.id}`} className="block group">
                        <motion.div
                            whileHover={{ x: 5 }}
                            className="bg-[#1a1d28] border border-white/10 rounded-lg p-3 hover:bg-[#232736] transition-colors flex gap-3 items-center"
                        >
                            <div className="w-12 h-12 rounded bg-gray-800 shrink-0 overflow-hidden">
                                {event.imageUrl ? (
                                    <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
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
                                <div className="flex items-center gap-2 mt-2">
                                    {(() => {
                                        // Check if odds are already percentages (e.g., 50) or probabilities (e.g., 0.5)
                                        const yesOddsValue = Number(event.yesOdds) || 0;
                                        const noOddsValue = Number(event.noOdds) || 0;
                                        const yesDisplay = yesOddsValue > 1 
                                            ? Math.round(yesOddsValue) 
                                            : Math.round(yesOddsValue * 100);
                                        const noDisplay = noOddsValue > 1 
                                            ? Math.round(noOddsValue) 
                                            : Math.round(noOddsValue * 100);
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
        </div>
    );
}
