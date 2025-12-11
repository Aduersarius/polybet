'use client';
import { Navbar } from "../components/Navbar";
import { SparklesCore as Sparks } from "../../components/ui/sparkles";
import { Footer } from "../components/Footer";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
  resolutionDate: string;
  createdAt: string;
  imageUrl?: string | null;
  volume?: number;
  betCount?: number;
  yesOdds?: number;
  noOdds?: number;
  type?: string;
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
  const [sortBy, setSortBy] = useState<'newest' | 'volume_high' | 'volume_low' | 'liquidity_high' | 'ending_soon'>('newest');
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

  // Fetch events from database
  const { data: eventsData, isLoading, error } = useQuery({
    queryKey: ['events', selectedCategory, timeHorizon, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({
        category: selectedCategory,
        timeHorizon,
        sortBy,
        limit: '50' // Fetch more for better filtering
      });
      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      // Handle both array (legacy) and paginated response (new)
      return (Array.isArray(data) ? data : data.data) as DbEvent[];
    },
  });

  const events = eventsData || [];


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


  // Fetch user's favorites for filtering
  const { data: userFavorites } = useQuery({
    queryKey: ['user-favorites'],
    queryFn: async () => {
      const res = await fetch('/api/user/favorites');
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
  });

  const { activeEvents, endedEvents } = useMemo(() => {
    let filtered = events;

    // Client-side filters that can't be done on API
    // Note: FAVORITES filtering is handled by the API, not client-side

    // Apply search filter (client-side for now)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e: DbEvent) =>
        e.title.toLowerCase().includes(query) ||
        ((e as any).categories && (e as any).categories.some((cat: string) => cat.toLowerCase().includes(query)))
      );
    }

    // API already handles category, time horizon, and sorting
    const now = new Date();
    return {
      activeEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) > now),
      endedEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) <= now)
    };
  }, [selectedCategory, searchQuery, events]);

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
          {/* Markets Background */}
          <div className="fixed inset-0 z-0"></div>

          {/* Markets Content */}
          <div className="relative z-10 pt-8 px-4 max-w-7xl mx-auto pb-12">

            {/* Sort Options */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="relative mb-8"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl font-bold text-white flex items-center gap-4 flex-1">
                    {selectedCategory === 'FAVORITES' ? 'My Favorites' :
                      selectedCategory === 'ALL' ? 'All Markets' :
                        selectedCategory === 'NEW' ? 'New Markets' :
                          selectedCategory === 'TRENDING' ? 'Trending Markets' :
                            `${selectedCategory} Markets`}
                    <div className="h-px bg-gradient-to-r from-[#bb86fc] to-transparent flex-1 hidden sm:block" />
                  </h2>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 w-full sm:w-auto">
                  {/* Time Horizon Filter */}
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 rounded-lg border border-white/10 p-2">
                    {[
                      { key: 'all', label: 'All' },
                      { key: '1d', label: '1D' },
                      { key: '1w', label: '1W' },
                      { key: '1m', label: '1M' }
                    ].map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setTimeHorizon(option.key as typeof timeHorizon)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${timeHorizon === option.key
                          ? 'bg-[#bb86fc]/20 text-[#bb86fc] border border-[#bb86fc]/30'
                          : 'text-gray-300 hover:text-gray-100 hover:bg-white/10'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {/* Sort - mobile select */}
                  <div className="w-full sm:hidden">
                    <label className="text-xs text-gray-400 block mb-1">Sort by</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#bb86fc]"
                    >
                      <option value="newest">Newest</option>
                      <option value="volume_high">Volume (High)</option>
                      <option value="volume_low">Volume (Low)</option>
                      <option value="liquidity_high">Liquidity (High)</option>
                      <option value="ending_soon">Ending Soon</option>
                    </select>
                  </div>

                  {/* Sort Dropdown - desktop */}
                  <div className="relative hidden sm:block">
                    <button
                      onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                      className="material-card px-3 py-2 text-sm text-gray-300 flex items-center gap-1.5 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                      {sortBy === 'newest' ? 'Newest' :
                        sortBy === 'volume_high' ? 'Volume ↑' :
                          sortBy === 'volume_low' ? 'Volume ↓' :
                            sortBy === 'liquidity_high' ? 'Liquidity ↑' :
                              sortBy === 'ending_soon' ? 'Ending Soon' : 'Newest'}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {sortDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-44 material-card rounded-lg shadow-xl z-10 overflow-hidden">
                        {[
                          { key: 'newest', label: 'Newest' },
                          { key: 'volume_high', label: 'Volume (High)' },
                          { key: 'volume_low', label: 'Volume (Low)' },
                          { key: 'liquidity_high', label: 'Liquidity (High)' },
                          { key: 'ending_soon', label: 'Ending Soon' }
                        ].map((option) => (
                          <button
                            key={option.key}
                            onClick={() => {
                              setSortBy(option.key as typeof sortBy);
                              setSortDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${sortBy === option.key
                              ? 'bg-[#bb86fc]/20 text-[#bb86fc]'
                              : 'text-gray-300 hover:bg-white/5'
                              }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
              {activeEvents.map((event) => (
                <EventCard2
                  key={event.id}
                  event={event}
                  onTradeClick={(event, option) => {
                    setSelectedEvent(event);
                    setPreselectedOption(option);
                    setTradingModalOpen(true);
                  }}
                  onMultipleTradeClick={(event) => {
                    setSelectedMultipleEvent({...event, outcomes: event.outcomes});
                    setMultipleTradingModalOpen(true);
                  }}
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
                  <h2 className="text-3xl font-bold mb-6 text-gray-500 flex items-center gap-4">
                    Ended Markets
                    <div className="h-px bg-gray-800 flex-1" />
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {endedEvents.map((event) => (
                      <EventCard2
                        key={event.id}
                        event={event}
                        isEnded={true}
                        onTradeClick={(event, option) => {
                          setSelectedEvent(event);
                          setPreselectedOption(option);
                          setTradingModalOpen(true);
                        }}
                        onMultipleTradeClick={(event) => {
                          setSelectedMultipleEvent({...event, outcomes: event.outcomes});
                          setMultipleTradingModalOpen(true);
                        }}
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
