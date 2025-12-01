'use client';
import { Navbar } from '@/app/components/Navbar';
import { ShareButtons } from '@/app/components/ShareButtons';
import { EventChat } from '@/app/components/EventChat';
import { OddsGraph } from '@/app/components/OddsGraph';
import { OrderBook } from '@/app/components/OrderBook';
import { SuggestedEvents } from '@/app/components/SuggestedEvents';
import { TradingPanel } from '@/app/components/TradingPanel';
import { MultipleTradingPanel } from '@/app/components/MultipleTradingPanel';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Footer } from '@/app/components/Footer';

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
    const { data: event, isLoading } = useQuery({
        queryKey: ['event', eventId], // WebSockets handle real-time updates
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

                <div className="pt-4 px-4 max-w-7xl mx-auto pb-8">

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Left Column - Chart & Stats */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Header Section - With Image on Right */}
                                <div className="flex gap-6 mt-6">
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

                                        <div className="flex items-baseline gap-3 mb-3">
                                            <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent leading-tight drop-shadow-lg">
                                                {event.title}
                                            </h1>
                                        </div>
                                        <p className="text-gray-400 text-sm mb-4 leading-relaxed">{event.description}</p>

                                        <div className="flex items-center gap-4">
                                            <ShareButtons eventTitle={event.title} eventId={event.id.toString()} />
                                            <div className="flex items-center gap-2 text-sm bg-[#1e1e1e]/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                                                <svg className="w-4 h-4 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                </svg>
                                                <span className="text-gray-500">Volume:</span>
                                                <span className="text-[#03dac6] font-bold">
                                                    {event.volume
                                                        ? event.volume >= 1000000
                                                            ? `$${(event.volume / 1000000).toFixed(2)}m`
                                                            : event.volume >= 1000
                                                                ? `$${(event.volume / 1000).toFixed(1)}k`
                                                                : `$${Math.round(event.volume)}`
                                                        : '$0'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Event Image - Right Side */}
                                    {event.imageUrl && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="shrink-0"
                                        >
                                            <div className="w-48 h-32 rounded-lg overflow-hidden border border-white/10 shadow-xl relative group">
                                                <img
                                                    src={event.imageUrl}
                                                    alt={event.title}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                {/* Charts Section */}
                                <div className="space-y-6">
                                    <OddsGraph eventId={event.id} />

                                    {/* Order Book */}
                                    <OrderBook
                                        eventId={eventId}
                                        selectedOption="YES"
                                        outcomes={event.outcomes || []}
                                        eventType={event.type || 'BINARY'}
                                    />

                                    {/* Rules Section */}
                                    {event.rules && (
                                        <div className="material-card p-6">
                                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-[#bb86fc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                Rules
                                            </h3>
                                            <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                                                {event.rules}
                                            </div>
                                        </div>
                                    )}
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
                                    {event.type === 'MULTIPLE' ? (
                                        <MultipleTradingPanel
                                            outcomes={event.outcomes || []}
                                            creationDate={event.createdAt || event.creationDate}
                                            resolutionDate={event.resolutionDate}
                                            onTrade={handleTrade}
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

                {/* Footer */}
                <Footer />
            </div>
        </main>
    );
}
