'use client';
import { Navbar } from '@/app/components/Navbar';
import { CompactEventPanel } from '@/app/components/CompactEventPanel';
import { EventChat } from '@/app/components/EventChat';
import { OddsGraph } from '@/app/components/OddsGraph';
import { OrderBook } from '@/app/components/OrderBook';
import { SuggestedEvents } from '@/app/components/SuggestedEvents';
import { TradingPanel } from '@/app/components/TradingPanel';
import { MultipleTradingPanel } from '@/app/components/MultipleTradingPanel';
import { ActivityList } from '@/app/components/ActivityList';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

function getCategoryImage(categories: string[]): string {
    if (!categories || categories.length === 0) return '/events/crypto.png';

    const categoryMap: { [key: string]: string } = {
        'CRYPTO': '/events/crypto.png',
        'SPORTS': '/events/sports.png',
        'POLITICS': '/events/politics.png',
        'ENTERTAINMENT': '/events/entertainment.png',
        'TECH': '/events/crypto.png', // Use crypto for tech
        'SCIENCE': '/events/crypto.png', // Use crypto for science
        'FINANCE': '/events/crypto.png', // Use crypto for finance
        'CULTURE': '/events/entertainment.png', // Use entertainment for culture
        'ECONOMY': '/events/crypto.png', // Use crypto for economy
        'ELECTIONS': '/events/politics.png', // Use politics for elections
        'BUSINESS': '/events/crypto.png', // Use crypto for business
        'WORLD': '/events/politics.png', // Use politics for world
    };

    for (const category of categories) {
        if (categoryMap[category]) {
            return categoryMap[category];
        }
    }

    return '/events/crypto.png'; // Default fallback
}

export default function EventPage() {
    const params = useParams();
    const router = useRouter();
    const eventId = params.id as string;
    const [selectedCategory, setSelectedCategory] = useState('ALL');

    const handleCategoryChange = (categoryId: string) => {
        setSelectedCategory(categoryId);
        // Save scroll position
        sessionStorage.setItem('scrollPos', window.scrollY.toString());
        // Navigate to home with category filter
        router.push(`/?category=${categoryId}#markets`);
    };

    const handleTrade = () => {
        // Trading panel will handle the API call
        // WebSocket will automatically update odds in real-time
        // No manual refetch needed!
    };

    // Fetch event from database
    const { data: event, isLoading, refetch } = useQuery({
        queryKey: ['event', eventId],
        queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}`);
            if (!res.ok) throw new Error('Failed to fetch event');
            return res.json();
        },
    });

    // Real-time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');

        function onTradeUpdate(update: any) {
            console.log('Received trade update:', update);
            if (update.eventId === eventId) {
                console.log('Refetching event data for', eventId);
                // Refetch event data to get updated probabilities
                refetch();
            }
        }

        socket.emit('join-event', eventId);
        socket.on('odds-update', onTradeUpdate);

        return () => {
            socket.emit('leave-event', eventId);
            socket.off('odds-update', onTradeUpdate);
        };
    }, [eventId, refetch]);

    if (isLoading || !event) {
        return (
            <main className="min-h-screen text-white relative overflow-hidden">
                <Navbar />
                <div className="flex items-center justify-center min-h-screen">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-[#bb86fc] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-gray-400">Loading event...</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="h-screen text-white relative overflow-hidden flex flex-col">
            {/* Animated Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-[#bb86fc]/5 via-transparent to-[#03dac6]/5" />
                <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-[#bb86fc]/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-[#03dac6]/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
                <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

                <div className="flex-1 overflow-hidden">
                    <div className="h-full px-4 max-w-7xl mx-auto">

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="h-full"
                        >
                            <div className="grid grid-cols-[1fr_24rem] gap-6 h-full">
                                {/* Left Column - Scrollable */}
                                <div className="overflow-y-auto no-scrollbar h-full pb-6 pr-2 pt-4">
                                    <div className="space-y-6">
                                        {/* Header Section - With Image on Right */}
                                        <div className="relative">
                                            <div className="flex items-center gap-3 mb-3">
                                                {/* Display all categories as badges */}
                                                {event.categories && event.categories.length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {event.categories.map((cat: string, idx: number) => (
                                                            <motion.span
                                                                key={idx}
                                                                whileHover={{ scale: 1.05 }}
                                                                className="px-3 py-1 bg-gradient-to-r from-[#bb86fc] via-[#a66ef1] to-[#9965f4] rounded-full text-xs font-bold shadow-lg shadow-[#bb86fc]/20 backdrop-blur-sm"
                                                            >
                                                                {cat}
                                                            </motion.span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                                    <svg className="w-3 h-3 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    Ends {new Date(event.resolutionDate).toLocaleDateString()}
                                                </div>
                                            </div>

                                            <div className="relative mb-4">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent leading-tight drop-shadow-lg">
                                                        {event.title}
                                                    </h1>
                                                </div>
                                                <p className="text-gray-400 text-sm leading-relaxed">{event.description}</p>
                                            </div>

                                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-white/10 shadow-lg absolute top-0 right-0">
                                                <img
                                                    src={event.imageUrl || getCategoryImage(event.categories)}
                                                    alt={event.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        </div>

                                        <CompactEventPanel
                                            eventTitle={event.title}
                                            eventId={event.id.toString()}
                                            volume={event.volume}
                                            creationDate={event.createdAt}
                                            resolutionDate={event.resolutionDate}
                                        />

                                        {/* Chart Section */}
                                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-1 shadow-2xl overflow-hidden">
                                            <div className="h-[400px] w-full">
                                                <OddsGraph
                                                    eventId={eventId.toString()}
                                                    currentYesPrice={event.yesOdds}
                                                />
                                            </div>
                                        </div>

                                        {/* Order Book */}
                                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-4 shadow-2xl h-[400px] flex flex-col">
                                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-[#bb86fc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                                Order Book
                                            </h3>
                                            <div className="flex-1 overflow-hidden">
                                                <OrderBook eventId={eventId.toString()} />
                                            </div>
                                        </div>

                                        {/* Comments Section */}
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.5 }}
                                        >
                                            <EventChat eventId={eventId.toString()} />
                                        </motion.div>
                                    </div>
                                </div>

                                {/* Right Column - Scrollable */}
                                <div className="overflow-y-auto no-scrollbar h-full pb-6 pl-2 pt-4">
                                    <div className="space-y-6">
                                        {event.type === 'MULTIPLE' ? (
                                            <MultipleTradingPanel
                                                outcomes={event.outcomes || []}
                                                creationDate={event.createdAt || event.creationDate}
                                                resolutionDate={event.resolutionDate}
                                                onTrade={handleTrade}
                                                onTradeSuccess={() => refetch()}
                                            />
                                        ) : (
                                            <TradingPanel
                                                yesPrice={event.yesOdds}
                                                noPrice={event.noOdds}
                                                creationDate={event.createdAt || event.creationDate}
                                                resolutionDate={event.resolutionDate}
                                                onTrade={handleTrade}
                                            />
                                        )}
                                        <SuggestedEvents category={event.categories && event.categories.length > 0 ? event.categories[0] : 'ALL'} currentEventId={event.id.toString()} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>

            </div>
        </main>
    );
}
