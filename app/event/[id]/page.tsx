'use client';
import { Navbar } from '@/app/components/Navbar';
import { ShareButtons } from '@/app/components/ShareButtons';
import { EventChat } from '@/app/components/EventChat';
import { OddsGraph } from '@/app/components/OddsGraph';
import { SuggestedEvents } from '@/app/components/SuggestedEvents';
import { TradingPanel } from '@/app/components/TradingPanel';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export default function EventPage() {
    const params = useParams();
    const router = useRouter();
    const eventId = params.id as string;
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [tradeCounter, setTradeCounter] = useState(0);

    const handleCategoryChange = (categoryId: string) => {
        setSelectedCategory(categoryId);
        // Save scroll position
        sessionStorage.setItem('scrollPos', window.scrollY.toString());
        // Navigate to home with category filter
        router.push(`/?category=${categoryId}#markets`);
    };

    const handleTrade = () => {
        // Increment trade counter to trigger chart refresh
        setTradeCounter(prev => prev + 1);
    };

    // Fetch event from database
    const { data: event, isLoading, refetch } = useQuery({
        queryKey: ['event', eventId, tradeCounter], // Include tradeCounter to refetch on trades
        queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}`);
            if (!res.ok) throw new Error('Failed to fetch event');
            return res.json();
        },
    });

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
        <main className="min-h-screen text-white relative">
            {/* Animated Background */}
            <div className="fixed inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-[#bb86fc]/5 via-transparent to-[#03dac6]/5" />
                <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-[#bb86fc]/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-[#03dac6]/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10">
                <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

                <div className="pt-[120px] px-4 max-w-7xl mx-auto pb-8">
                    {/* Back Button */}
                    <Link href="/#markets" scroll={false}>
                        <motion.button
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={{ x: -5 }}
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
                        >
                            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to Markets
                        </motion.button>
                    </Link>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Left Column - Chart & Stats */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Header Section - Compact */}
                                <div className="flex flex-col-reverse md:flex-row justify-between gap-6 mb-2">
                                    <div className="flex-1">
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

                                        <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent leading-tight drop-shadow-lg">
                                            {event.title}
                                        </h1>
                                        <p className="text-gray-400 text-sm mb-4 leading-relaxed">{event.description}</p>


                                        <ShareButtons eventTitle={event.title} eventId={event.id.toString()} />
                                    </div>

                                    {/* Event Image - Right Side & Smaller */}
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="shrink-0"
                                    >
                                        <div className="w-full md:w-48 h-32 rounded-lg overflow-hidden border border-white/10 shadow-xl relative group">
                                            {event.imageUrl ? (
                                                <img
                                                    src={event.imageUrl}
                                                    alt={event.title}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center ${event.categories && event.categories.length > 0 && event.categories[0] === 'CRYPTO' ? 'bg-gradient-to-br from-orange-500/20 to-orange-900/40' :
                                                    event.categories && event.categories.length > 0 && event.categories[0] === 'SPORTS' ? 'bg-gradient-to-br from-blue-500/20 to-blue-900/40' :
                                                        event.categories && event.categories.length > 0 && event.categories[0] === 'POLITICS' ? 'bg-gradient-to-br from-red-500/20 to-red-900/40' :
                                                            'bg-gradient-to-br from-purple-500/20 to-purple-900/40'
                                                    }`}>
                                                    <span className="text-2xl opacity-50">{event.categories && event.categories.length > 0 ? event.categories[0][0] : '?'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                </div>

                                {/* Stats Cards - Compact */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10">
                                        <div className="text-gray-400 text-xs mb-1">Volume</div>
                                        <div className="text-xl font-bold text-[#03dac6]">
                                            {event.volume
                                                ? event.volume >= 1000
                                                    ? `$${(event.volume / 1000).toFixed(1)}k`
                                                    : `$${Math.round(event.volume)}`
                                                : '$0'}
                                        </div>
                                    </div>
                                    <div className="bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10">
                                        <div className="text-gray-400 text-xs mb-1">Trades</div>
                                        <div className="text-xl font-bold text-[#bb86fc]">{event.betCount || 0}</div>
                                    </div>
                                    <div className="bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10">
                                        <div className="text-gray-400 text-xs mb-1">Liquidity</div>
                                        <div className="text-xl font-bold text-white">$100.0</div>
                                    </div>
                                </div>

                                {/* Charts Section */}
                                <div className="space-y-6">
                                    <OddsGraph eventId={event.id} key={`odds-${event.id}-${tradeCounter}`} />
                                </div>

                                {/* Live Chat */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                    className="w-full"
                                >
                                    <EventChat eventId={eventId.toString()} />
                                </motion.div>
                            </div>

                            {/* Right Column - Sticky Trading Panel */}
                            <div className="lg:col-span-1">
                                <div className="sticky top-32 space-y-6 px-2">
                                    <TradingPanel
                                        yesPrice={event.yesOdds}
                                        noPrice={event.noOdds}
                                        creationDate={event.createdAt || event.creationDate}
                                        resolutionDate={event.resolutionDate}
                                        onTrade={handleTrade}
                                    />
                                    <SuggestedEvents category={event.categories && event.categories.length > 0 ? event.categories[0] : 'ALL'} currentEventId={event.id.toString()} />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </main>
    );
}
