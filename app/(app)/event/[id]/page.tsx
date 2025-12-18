'use client';
import { Navbar } from '@/app/components/Navbar';
import { CompactEventPanel } from '@/app/components/CompactEventPanel';
import { EventChat } from '@/app/components/EventChat';
import { OddsChartV2 } from '@/app/components/charts/OddsChartV2';
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
    const [liveEvent, setLiveEvent] = useState<any>(null);
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [collapsedSections, setCollapsedSections] = useState({
        chart: false,
        orderbook: false,
        chat: false,
    });
    const [tradeIntent, setTradeIntent] = useState<{
        side: 'buy' | 'sell';
        price: number;
        amount: number;
        outcomeId?: string; // specific outcome for multiple
    } | null>(null);

    const handleTrade = () => {
        // Trading panel will handle the API call
        // WebSocket will automatically update odds in real-time
        // No manual refetch needed!
    };

    const handleCategoryChange = (category: string) => {
        router.push(`/?category=${category}`);
    };

    // Fetch event - detect if it's a Polymarket ID (numeric) or local UUID
    const isPolymarketId = /^\d+$/.test(eventId);
    
    const { data: event, isLoading, refetch } = useQuery({
        queryKey: ['event', eventId],
        queryFn: async () => {
            // For Polymarket IDs (numeric strings), ONLY use Polymarket API (don't try local DB)
            if (isPolymarketId) {
                // Prefer local DB cache first
                const dbRes = await fetch(`/api/events/${eventId}?by=polymarket`);
                if (dbRes.ok) {
                    const dbData = await dbRes.json();
                    if (!dbData?.error) return dbData;
                }

                const polyRes = await fetch(`/api/polymarket/markets?id=${eventId}&limit=1`);
                if (!polyRes.ok) {
                    throw new Error(`Polymarket API error: ${polyRes.status}`);
                }
                const data = await polyRes.json();
                if (Array.isArray(data) && data.length) return data[0];
                throw new Error('Polymarket event not found');
            }
            
            // For UUIDs, ONLY try local DB (these are never in Polymarket)
            const res = await fetch(`/api/events/${eventId}`);
            if (!res.ok) {
                throw new Error(`Event API error: ${res.status}`);
            }
            return res.json();
        },
        // Aggressive caching for better performance
        staleTime: 30000, // Data stays fresh for 30 seconds
        gcTime: 5 * 60 * 1000, // Cache for 5 minutes
        refetchOnWindowFocus: false, // Don't refetch on tab focus
        refetchOnMount: false, // Don't refetch if cache exists
        retry: 1, // Only retry once to fail fast
    });

    // Initialize live event data
    useEffect(() => {
        if (event) {
            setLiveEvent(event);
        }
    }, [event]);

    // Collapse larger sections by default on mobile, expand on desktop
    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 1024px)');
        const setByViewport = (isMobile: boolean) => {
            setCollapsedSections((prev) => ({
                ...prev,
                chart: isMobile,
                orderbook: isMobile,
                chat: isMobile,
            }));
        };
        setByViewport(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setByViewport(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const toggleSection = (section: 'chart' | 'orderbook' | 'chat') => {
        setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    // Initialize selectedCategory from storage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            let saved = null;
            try {
                saved = localStorage.getItem('selectedCategory');
            } catch (e) {
                try {
                    saved = sessionStorage.getItem('selectedCategory');
                } catch (e2) {
                    // Storage not available
                }
            }
            if (saved) {
                setSelectedCategory(saved);
            }
        }
    }, []);

    // Real-time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');

        function onTradeUpdate(update: any) {
            console.log('Received trade update:', update);
            if (update.eventId === eventId) {
                console.log('Updating live event data for', eventId);
                // Update live event data with new odds/outcomes
                const { eventId: _, ...updateData } = update;
                if (liveEvent) {
                    setLiveEvent({ ...liveEvent, ...updateData });
                }
            }
        }

        socket.emit('join-event', eventId);
        socket.on('odds-update', onTradeUpdate);

        return () => {
            socket.emit('leave-event', eventId);
            socket.off('odds-update', onTradeUpdate);
        };
    }, [eventId]);

    if (isLoading || !liveEvent) {
        return (
            <main className="min-h-screen text-white relative overflow-hidden">
                <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
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
        <main className="min-h-screen text-white relative flex flex-col">
            {/* Animated Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-[#bb86fc]/5 via-transparent to-[#03dac6]/5" />
                <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-[#bb86fc]/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-[#03dac6]/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
                <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

                <div className="flex-1">
                    <div className="px-4 sm:px-5 max-w-7xl mx-auto pb-10">

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="h-full"
                        >
                            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_24rem] lg:items-start">
                                {/* Left Column */}
                                <div className="pb-6 lg:pr-2 pt-4 space-y-6 order-1">
                                    <div className="space-y-6">
                                        {/* Header Section - With Image on Right */}
                                        <div className="relative">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6 lg:pr-32">
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        {/* Display all categories as badges */}
                                                        {liveEvent.categories && liveEvent.categories.length > 0 && (
                                                            <div className="flex flex-wrap gap-2">
                                                                {liveEvent.categories.map((cat: string, idx: number) => (
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
                                                            Ends {new Date(liveEvent.resolutionDate).toLocaleDateString()}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex items-start gap-3">
                                                            <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent leading-tight drop-shadow-lg">
                                                                {liveEvent.title}
                                                            </h1>
                                                        </div>
                                                        <p className="text-gray-400 text-sm leading-relaxed">{liveEvent.description}</p>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 lg:absolute lg:top-0 lg:right-0">
                                                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                                                        <img
                                                            src={liveEvent.imageUrl || getCategoryImage(liveEvent.categories)}
                                                            alt={liveEvent.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Trading panel on mobile (desktop keeps side placement) */}
                                        <div className="lg:hidden">
                                            {liveEvent.type === 'MULTIPLE' ? (
                                                <MultipleTradingPanel
                                                    outcomes={liveEvent.outcomes || []}
                                                    liveOutcomes={liveEvent.outcomes || []}
                                                    creationDate={liveEvent.createdAt || liveEvent.creationDate}
                                                    resolutionDate={liveEvent.resolutionDate}
                                                    onTrade={handleTrade}
                                                    tradeIntent={tradeIntent}
                                                />
                                            ) : (
                                                <TradingPanel
                                                    eventData={liveEvent}
                                                    creationDate={liveEvent.createdAt || liveEvent.creationDate}
                                                    resolutionDate={liveEvent.resolutionDate}
                                                    onTrade={handleTrade}
                                                    tradeIntent={tradeIntent}
                                                />
                                            )}
                                        </div>

                                        <CompactEventPanel
                                            eventTitle={liveEvent.title}
                                            eventId={liveEvent.id.toString()}
                                            volume={liveEvent.volume}
                                            creationDate={liveEvent.createdAt}
                                            resolutionDate={liveEvent.resolutionDate}
                                        />

                                        {(liveEvent.type === 'BINARY' || liveEvent.type === 'MULTIPLE') && (
                                            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl overflow-hidden odds-chart">
                                                <button
                                                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-200 hover:text-white lg:hidden"
                                                    onClick={() => toggleSection('chart')}
                                                >
                                                    <span className="font-semibold">Price chart</span>
                                                    <svg
                                                        className={`w-4 h-4 transition-transform ${collapsedSections.chart ? '-rotate-90' : 'rotate-0'}`}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                {!collapsedSections.chart && (
                                                    <div className="h-[260px] sm:h-[340px] lg:h-[460px] w-full transition-[max-height] duration-200">
                                                        <OddsChartV2
                                                            eventId={eventId.toString()}
                                                            eventType={liveEvent.type}
                                                            outcomes={liveEvent.outcomes || []}
                                                            liveOutcomes={liveEvent.outcomes || []}
                                                            currentYesPrice={liveEvent.yesOdds}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl overflow-hidden order-book-section">
                                            <button
                                                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-200 hover:text-white lg:hidden"
                                                onClick={() => toggleSection('orderbook')}
                                            >
                                                <span className="font-semibold">Order book</span>
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${collapsedSections.orderbook ? '-rotate-90' : 'rotate-0'}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {!collapsedSections.orderbook && (
                                                <div className="h-[260px] sm:h-[320px] lg:h-[400px] w-full">
                                                    <OrderBook
                                                        eventId={eventId.toString()}
                                                        outcomes={liveEvent.outcomes}
                                                        eventType={liveEvent.type}
                                                        onOrderSelect={setTradeIntent}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Related Markets - Desktop */}
                                        <div className="hidden lg:block">
                                            <SuggestedEvents category={liveEvent.categories && liveEvent.categories.length > 0 ? liveEvent.categories[0] : 'ALL'} currentEventId={liveEvent.id.toString()} />
                                        </div>

                                        {/* Comments Section */}
                                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                                            <button
                                                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-200 hover:text-white"
                                                onClick={() => toggleSection('chat')}
                                            >
                                                <span className="font-semibold">Discussion</span>
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${collapsedSections.chat ? '-rotate-90' : 'rotate-0'}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {!collapsedSections.chat && (
                                                <div className="p-4">
                                                    <EventChat eventId={eventId.toString()} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Related markets on mobile (desktop in side column) */}
                                        <div className="lg:hidden">
                                            <SuggestedEvents category={liveEvent.categories && liveEvent.categories.length > 0 ? liveEvent.categories[0] : 'ALL'} currentEventId={liveEvent.id.toString()} />
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Sticky */}
                                <aside className="lg:pl-2 pt-4 order-2 hidden lg:block sticky top-24 self-start z-10">
                                    <div className="space-y-6 trading-panel">
                                        {liveEvent.type === 'MULTIPLE' ? (
                                            <MultipleTradingPanel
                                                outcomes={liveEvent.outcomes || []}
                                                liveOutcomes={liveEvent.outcomes || []}
                                                creationDate={liveEvent.createdAt || liveEvent.creationDate}
                                                resolutionDate={liveEvent.resolutionDate}
                                                onTrade={handleTrade}
                                                tradeIntent={tradeIntent}
                                            />
                                        ) : (
                                            <TradingPanel
                                                eventData={liveEvent}
                                                creationDate={liveEvent.createdAt || liveEvent.creationDate}
                                                resolutionDate={liveEvent.resolutionDate}
                                                onTrade={handleTrade}
                                                tradeIntent={tradeIntent}
                                            />
                                        )}
                                    </div>
                                </aside>
                            </div>
                        </motion.div>
                    </div>
                </div>

            </div>
        </main>
    );
}
