'use client';
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TradingPanelModal } from "../components/TradingPanelModal";
import { MultipleTradingPanelModal } from "../components/MultipleTradingPanelModal";
import { EventCard2 } from "../components/EventCard2";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, ChartConfig } from "@/components/ui/chart";

// Cookie utility functions
function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name: string): string | null {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

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
  yesOdds?: number;
  noOdds?: number;
  type?: string;
  source?: string;
  polymarketId?: string;
  externalVolume?: number;
  externalBetCount?: number;
  outcomes?: Array<{
    id: string;
    name: string;
    probability: number;
    color?: string;
  }>;
}

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  console.log('selectedCategory state initialized to:', selectedCategory);
  const [timeHorizon, setTimeHorizon] = useState<'all' | '1d' | '1w' | '1m'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'volume_high' | 'volume_low' | 'liquidity_high' | 'ending_soon'>('volume_high');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Trading panel modal state
  const [tradingModalOpen, setTradingModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DbEvent | null>(null);
  const [preselectedOption, setPreselectedOption] = useState<'YES' | 'NO'>('YES');

  // Multiple trading panel modal state
  const [multipleTradingModalOpen, setMultipleTradingModalOpen] = useState(false);
  const [selectedMultipleEvent, setSelectedMultipleEvent] = useState<DbEvent | null>(null);

  const router = useRouter();

  const handleCategoryChange = (category: string) => {
    router.push(`?category=${category}`);
    setSelectedCategory(category);
  };

  // Fetch events from DB (includes synced Polymarket markets)
  const { data: eventsData } = useQuery<DbEvent[]>({
    queryKey: ['events-feed', selectedCategory, timeHorizon, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({
        category: selectedCategory === 'ALL' ? '' : selectedCategory,
        timeHorizon,
        sortBy,
        limit: '120',
      });
      const res = await fetch(`/api/events?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const json = await res.json();
      const data = Array.isArray(json) ? json : json.data;
      const normalized = (data || []).map((evt: any) => ({
        ...evt,
        category: evt.category || (evt.categories?.[0] ?? 'General'),
      }));
      // #region agent log
      // fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     sessionId: 'debug-session',
      //     runId: 'pre-fix',
      //     hypothesisId: 'H-client-fetch',
      //     location: 'app/(app)/page.tsx:queryFn',
      //     message: 'fetched events',
      //     data: {
      //       selectedCategory,
      //       timeHorizon,
      //       sortBy,
      //       fetchedCount: (data || []).length,
      //       normalizedCount: normalized.length
      //     },
      //     timestamp: Date.now(),
      //   }),
      // }).catch(() => { });
      // #endregion
      return normalized as DbEvent[];
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Fetch user's favorite events
  const { data: favoriteEvents } = useQuery<DbEvent[]>({
    queryKey: ['favorite-events'],
    queryFn: async () => {
      const res = await fetch('/api/user/favorites');
      if (!res.ok) {
        if (res.status === 401) return []; // User not logged in
        throw new Error('Failed to fetch favorites');
      }
      const json = await res.json();
      const data = json.data || [];
      return data.map((evt: any) => ({
        ...evt,
        category: evt.category || (evt.categories?.[0] ?? 'General'),
      })) as DbEvent[];
    },
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
  });


  // Listen for global search events
  useEffect(() => {
    const handleGlobalSearch = (e: CustomEvent) => {
      setSearchQuery(e.detail.query);
    };
    window.addEventListener('globalSearch', handleGlobalSearch as EventListener);
    return () => window.removeEventListener('globalSearch', handleGlobalSearch as EventListener);
  }, []);

  // Log selectedCategory changes
  useEffect(() => {
    console.log('selectedCategory changed to:', selectedCategory);
  }, [selectedCategory]);

  // Save selectedCategory to cookies
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setCookie('selectedCategory', selectedCategory, 30);
        console.log('Saved selectedCategory to cookies:', selectedCategory);
      } catch (e) {
        console.log('Cookies not available:', e);
      }
    }
  }, [selectedCategory]);

  // Check for category query param and restore scroll on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('Restoration useEffect running on mount');
      const urlParams = new URLSearchParams(window.location.search);
      const category = urlParams.get('category');
      console.log('URL category param:', category);
      if (category) {
        console.log('Setting selectedCategory from URL:', category);
        setSelectedCategory(category);
      } else {
        let saved = null;
        try {
          saved = getCookie('selectedCategory');
          console.log('Restored selectedCategory from cookies:', saved);
        } catch (e) {
          console.log('Cookies not available:', e);
        }
        if (saved) {
          setSelectedCategory(saved);
        } else {
          console.log('No saved category, using default ALL');
        }
      }
      // Restore scroll position
      const scrollPos = sessionStorage.getItem('scrollPos');
      if (scrollPos) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(scrollPos));
          sessionStorage.removeItem('scrollPos');
        }, 500);
      }
    }
  }, []);


  const { activeEvents, endedEvents } = useMemo(() => {
    const now = new Date();
    let filtered = (eventsData || []).slice();

    // Apply category filters client-side for Polymarket data
    if (selectedCategory === 'FAVORITES') {
      filtered = (favoriteEvents || []).slice();
    } else if (selectedCategory !== 'ALL' && selectedCategory !== 'TRENDING' && selectedCategory !== 'NEW') {
      const catLower = selectedCategory.toLowerCase();
      filtered = filtered.filter((e: DbEvent) => {
        const categories = [
          e.category,
          ...(((e as any).categories as string[] | undefined) || []),
        ]
          .filter(Boolean)
          .map((c) => String(c).toLowerCase());
        return categories.some((c) => c.includes(catLower));
      });
    }

    // Time horizon filtering
    if (timeHorizon !== 'all') {
      const horizonMs =
        timeHorizon === '1d'
          ? 24 * 60 * 60 * 1000
          : timeHorizon === '1w'
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((e: DbEvent) => {
        const end = new Date(e.resolutionDate).getTime();
        return end >= now.getTime() && end <= now.getTime() + horizonMs;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e: DbEvent) =>
        e.title.toLowerCase().includes(query) ||
        ((e as any).categories && (e as any).categories.some((cat: string) => cat.toLowerCase().includes(query)))
      );
    }

    // Sort locally based on selection
    const effectiveSort =
      selectedCategory === 'TRENDING' ? 'volume_high' :
        selectedCategory === 'NEW' ? 'newest' : sortBy;

    filtered.sort((a: DbEvent, b: DbEvent) => {
      if (effectiveSort === 'volume_high') return (b.volume || 0) - (a.volume || 0);
      if (effectiveSort === 'volume_low') return (a.volume || 0) - (b.volume || 0);
      if (effectiveSort === 'liquidity_high') return (b.betCount || 0) - (a.betCount || 0);
      if (effectiveSort === 'ending_soon') return new Date(a.resolutionDate).getTime() - new Date(b.resolutionDate).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
    });

    return {
      activeEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) > now),
      endedEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) <= now)
    };
  }, [selectedCategory, searchQuery, eventsData, favoriteEvents, timeHorizon, sortBy]);

  // #region agent log
  // useEffect(() => {
  //   const now = new Date();
  //   fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       sessionId: 'debug-session',
  //       runId: 'pre-fix',
  //       hypothesisId: 'H-client-filter',
  //       location: 'app/(app)/page.tsx:useMemo',
  //       message: 'client filter result',
  //       data: {
  //         selectedCategory,
  //         timeHorizon,
  //         sortBy,
  //         searchQuery,
  //         eventsDataCount: eventsData?.length ?? 0,
  //         activeCount: activeEvents.length,
  //         endedCount: endedEvents.length,
  //         nowIso: now.toISOString(),
  //       },
  //       timestamp: Date.now(),
  //     }),
  //   }).catch(() => { });
  // }, [selectedCategory, timeHorizon, sortBy, searchQuery, eventsData, activeEvents.length, endedEvents.length]);
  // #endregion


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

  const getProgressPercentage = (endDate: Date) => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // assume created 30 days ago
    const total = endDate.getTime() - createdAt.getTime();
    const elapsed = now.getTime() - createdAt.getTime();
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  return (
    <main className="flex flex-col relative">

      <div className="flex-grow">
        <motion.div
          key="markets"
          className="min-h-screen relative text-white z-10"
        >
          <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

          {/* Markets Content */}
          <div className="relative z-10 pt-10 px-6 max-w-7xl mx-auto pb-20">

            {/* Sort Options */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative mb-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent flex items-center gap-4 flex-1 tracking-tight uppercase" style={{letterSpacing: '0.03em'}}>
                    {selectedCategory === 'FAVORITES' ? 'My Favorites' :
                      selectedCategory === 'ALL' ? 'All Markets' :
                        selectedCategory === 'NEW' ? 'New Markets' :
                          selectedCategory === 'TRENDING' ? 'Trending Markets' :
                            `${selectedCategory} Markets`}
                    <div className="h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent flex-1 hidden sm:block" />
                  </h2>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full sm:w-auto">
                  {/* Time Horizon Filter */}
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { key: 'all', label: 'All' },
                      { key: '1d', label: '1D' },
                      { key: '1w', label: '1W' },
                      { key: '1m', label: '1M' }
                    ].map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setTimeHorizon(option.key as typeof timeHorizon)}
                        className={`h-9 px-4 text-xs font-bold rounded-xl transition-all duration-300 uppercase tracking-wide ${timeHorizon === option.key
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)]'
                          : 'bg-white/5 backdrop-blur-sm text-gray-400 hover:text-white border border-white/10 hover:border-blue-400/30 hover:bg-white/10'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {/* Sort Controls */}
                  <div className="flex items-center gap-2">
                    {[
                      { key: 'newest', label: 'Newest' },
                      { key: 'volume_high', label: 'Vol ↑' },
                      { key: 'volume_low', label: 'Vol ↓' },
                      { key: 'liquidity_high', label: 'Liq ↑' },
                      { key: 'ending_soon', label: 'Ending' }
                    ].map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setSortBy(option.key as typeof sortBy)}
                        className={`h-9 px-4 text-xs font-bold rounded-xl transition-all duration-300 uppercase tracking-wide ${sortBy === option.key
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)]'
                          : 'bg-white/5 backdrop-blur-sm text-gray-400 hover:text-white border border-white/10 hover:border-blue-400/30 hover:bg-white/10'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 mb-12">
              {activeEvents.map((event, idx) => (
                <EventCard2
                  key={event.id}
                  event={event}
                  index={idx}
                  onTradeClick={(event, option) => {
                    setSelectedEvent(event);
                    setPreselectedOption(option);
                    setTradingModalOpen(true);
                  }}
                  onMultipleTradeClick={(event) => {
                    setSelectedMultipleEvent({...event, outcomes: event.outcomes});
                    setMultipleTradingModalOpen(true);
                  }}
                  onCategoryClick={handleCategoryChange}
                />
              ))}
            </div>

            {/* Ended Markets Section */}
            {
              endedEvents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <h2 className="text-2xl font-bold mb-6 text-gray-600 flex items-center gap-4 tracking-tight uppercase" style={{letterSpacing: '0.03em'}}>
                    Ended Markets
                    <div className="h-px bg-white/10 flex-1" />
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {endedEvents.map((event, idx) => (
                      <EventCard2
                        key={event.id}
                        event={event}
                        isEnded={true}
                        index={idx}
                        onTradeClick={(event, option) => {
                          setSelectedEvent(event);
                          setPreselectedOption(option);
                          setTradingModalOpen(true);
                        }}
                        onMultipleTradeClick={(event) => {
                          setSelectedMultipleEvent({...event, outcomes: event.outcomes});
                          setMultipleTradingModalOpen(true);
                        }}
                        onCategoryClick={handleCategoryChange}
                      />
                    ))}
                  </div>
                </motion.div>
              )
            }
          </div >
        </motion.div >
      </div>

      <Footer />

      {/* Trading Panel Modal */}
      {selectedEvent && (
        <TradingPanelModal
          isOpen={tradingModalOpen}
          onClose={() => setTradingModalOpen(false)}
          eventId={selectedEvent.id}
          eventTitle={selectedEvent.title}
          creationDate={selectedEvent.createdAt}
          resolutionDate={selectedEvent.resolutionDate}
          preselectedOption={preselectedOption}
        />
      )}

      {/* Multiple Trading Panel Modal */}
      {selectedMultipleEvent && selectedMultipleEvent.outcomes && (
        <MultipleTradingPanelModal
          isOpen={multipleTradingModalOpen}
          onClose={() => setMultipleTradingModalOpen(false)}
          eventId={selectedMultipleEvent.id}
          eventTitle={selectedMultipleEvent.title}
          outcomes={selectedMultipleEvent.outcomes.map(outcome => ({
            id: outcome.id,
            name: outcome.name,
            probability: outcome.probability,
            price: outcome.probability, // Use probability as price approximation
            odds: 1 / outcome.probability, // Calculate odds from probability
            color: outcome.color
          }))}
          creationDate={selectedMultipleEvent.createdAt}
          resolutionDate={selectedMultipleEvent.resolutionDate}
        />
      )}
    </main>
  );
}
