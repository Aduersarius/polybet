'use client';
import { Navbar } from '@/app/components/Navbar';
import { CompactEventPanel } from '@/app/components/CompactEventPanel';
import { EventChat } from '@/app/components/EventChat';
import { OddsChartV2 } from '@/app/components/charts/OddsChartV2';
import { OrderBook } from '@/app/components/OrderBook';
import { SuggestedEvents } from '@/app/components/SuggestedEvents';
import { TradingPanel } from '@/app/components/TradingPanel';
import { MultipleTradingPanel } from '@/app/components/MultipleTradingPanel';
import { GroupedBinaryTradingPanel } from '@/app/components/GroupedBinaryTradingPanel';
import { ActivityList } from '@/app/components/ActivityList';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

/**
 * Helper to check if an event has multiple outcomes.
 * Both MULTIPLE and GROUPED_BINARY events should use multi-outcome UI.
 */
const isMultiOutcomeEvent = (type?: string): boolean => {
    return type === 'MULTIPLE' || type === 'GROUPED_BINARY';
};

function getCategoryImage(categories: string[]): string {
    if (!categories || categories.length === 0) return '/events/crypto.png';

    const categoryMap: { [key: string]: string } = {
        'BUSINESS': '/events/crypto.png',
        'CRYPTO': '/events/crypto.png',
        'CULTURE': '/events/entertainment.png',
        'ECONOMY': '/events/crypto.png',
        'ELECTIONS': '/events/politics.png',
        'ESPORTS': '/events/entertainment.png',
        'FINANCE': '/events/crypto.png',
        'POLITICS': '/events/politics.png',
        'SCIENCE': '/events/crypto.png',
        'SPORTS': '/events/sports.png',
        'TECH': '/events/crypto.png',
        'WORLD': '/events/politics.png',
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
            // Set dynamic page title
            document.title = `${event.title} | Pariflow`;
        }
        return () => {
            document.title = 'Pariflow | Real-Life Market Forecasting';
        };
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
        const channel = socket.subscribe(`event-${eventId}`);

        function onTradeUpdate(update: any) {
            console.log('Received real-time update:', update);
            if (update.eventId !== eventId) return;

            setLiveEvent((prev: any) => {
                if (!prev) return prev;

                const updateData: any = { ...update };

                // Normalize outcomes if they exist in the update
                if (updateData.outcomes && Array.isArray(updateData.outcomes)) {
                    updateData.outcomes = updateData.outcomes.map((outcome: any) => {
                        const probability = outcome.probability ?? 0;
                        const p = probability > 1 ? probability / 100 : probability;
                        return {
                            ...outcome,
                            probability: p,
                            price: p,
                            odds: p > 0 ? 1 / p : 1,
                        };
                    });
                }

                // For Binary events, update yesOdds/noOdds directly with normalization
                const next = { ...prev };
                if (update.yesPrice !== undefined) {
                    const p = update.yesPrice > 1 ? update.yesPrice / 100 : update.yesPrice;
                    next.yesOdds = p;
                    if (update.noPrice === undefined && prev.type === 'BINARY') next.noOdds = 1 - p;
                }
                if (update.noPrice !== undefined) {
                    const p = update.noPrice > 1 ? update.noPrice / 100 : update.noPrice;
                    next.noOdds = p;
                    if (update.yesPrice === undefined && prev.type === 'BINARY') next.yesOdds = 1 - p;
                }
                if (update.outcomes) next.outcomes = updateData.outcomes;

                return next;
            });
        }

        channel.bind(`odds-update`, onTradeUpdate);

        return () => {
            channel.unbind(`odds-update`, onTradeUpdate);
            socket.unsubscribe(`event-${eventId}`);
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
            {/* Animated Background - Positioned to be visible through transparent navbar */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-[#bb86fc]/5 via-transparent to-[#03dac6]/5" />
                <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-[#bb86fc]/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-[#03dac6]/10 rounded-full blur-3xl" />
            </div>

            <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

            <div className="relative z-10 flex flex-col h-screen">

                {/* Main content area with independent scrolling columns */}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full px-4 sm:px-5 max-w-7xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="h-full"
                        >
                            <div className="h-full flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_24rem] lg:items-stretch">
                                {/* Left Column - Scrollable */}
                                <div className="flex-1 overflow-y-auto overflow-x-hidden pb-6 lg:pr-2 space-y-6 order-1 no-scrollbar pt-[calc(var(--navbar-height)+1.5rem)]">
                                    <div className="space-y-6 pt-4">
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
                                            {liveEvent.type === 'GROUPED_BINARY' ? (
                                                <GroupedBinaryTradingPanel
                                                    eventId={eventId.toString()}
                                                    outcomes={liveEvent.outcomes || []}
                                                    liveOutcomes={liveEvent.outcomes || []}
                                                    creationDate={liveEvent.createdAt || liveEvent.creationDate}
                                                    resolutionDate={liveEvent.resolutionDate}
                                                    onTrade={handleTrade}
                                                />
                                            ) : isMultiOutcomeEvent(liveEvent.type) ? (
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

                                        {(liveEvent.type === 'BINARY' || isMultiOutcomeEvent(liveEvent.type)) && (
                                            <div className="bg-[#1a1d28] rounded-xl border border-white/10 shadow-2xl overflow-hidden odds-chart">
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

                                        <div className="bg-[#1a1d28] rounded-xl border border-white/10 shadow-2xl overflow-hidden order-book-section">
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

                                        {/* Rules Section - Only shown if rules exist */}
                                        {liveEvent.rules && liveEvent.rules.trim() && (
                                            <div className="bg-[#1a1d28] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                                                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-[#bb86fc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <span className="font-semibold text-sm text-gray-200">Resolution Rules</span>
                                                </div>
                                                <div className="p-4">
                                                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
                                                        {liveEvent.rules}
                                                    </p>
                                                </div>
                                            </div>
                                        )}


                                        {/* Comments Section */}
                                        <div className="bg-[#1a1d28] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                                            <button
                                                className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-300 hover:text-white"
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
                                                <div className="px-4 pb-4">
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

                                {/* Right Column - Scrollable */}
                                <aside className="flex-1 overflow-y-auto overflow-x-hidden lg:pl-2 order-2 hidden lg:block z-10 no-scrollbar pt-[calc(var(--navbar-height)+1.5rem)]">
                                    <div className="space-y-6 trading-panel pb-6 pt-4">
                                        {liveEvent.type === 'GROUPED_BINARY' ? (
                                            <GroupedBinaryTradingPanel
                                                eventId={eventId.toString()}
                                                outcomes={liveEvent.outcomes || []}
                                                liveOutcomes={liveEvent.outcomes || []}
                                                creationDate={liveEvent.createdAt || liveEvent.creationDate}
                                                resolutionDate={liveEvent.resolutionDate}
                                                onTrade={handleTrade}
                                            />
                                        ) : isMultiOutcomeEvent(liveEvent.type) ? (
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
                                        {/* Related Markets */}
                                        <SuggestedEvents category={liveEvent.categories && liveEvent.categories.length > 0 ? liveEvent.categories[0] : 'ALL'} currentEventId={liveEvent.id.toString()} />
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
