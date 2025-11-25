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
            const res = await fetch(`/api/events?category=${category}`);
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
                            className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors flex gap-3 items-center"
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
                                <div className="flex items-center gap-3 mt-1 text-xs">
                                    <span className="text-[#03dac6]">Yes {event.yesOdds}%</span>
                                    <span className="text-[#cf6679]">No {event.noOdds}%</span>
                                </div>
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
