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

  const EventCard = ({ event, isEnded = false }: { event: DbEvent, isEnded?: boolean }) => {
    const [isFavorite, setIsFavorite] = useState(false);

    // Fetch user's favorites
    const { data: userFavorites, refetch: refetchFavorites } = useQuery({
      queryKey: ['user-favorites'],
      queryFn: async () => {
        const res = await fetch('/api/user/favorites');
        if (!res.ok) return [];
        const data = await res.json();
        return data.data || [];
      },
    });

    // Update favorite state when userFavorites changes
    useEffect(() => {
      if (userFavorites) {
        setIsFavorite(userFavorites.some((fav: any) => fav.id === event.id));
      }
    }, [userFavorites, event.id]);

    // Real-time odds state
    const [liveYesOdds, setLiveYesOdds] = useState(event.yesOdds);
    const [liveNoOdds, setLiveNoOdds] = useState(event.noOdds);
    const [liveOutcomes, setLiveOutcomes] = useState(event.outcomes);

    // Update local state if props change
    useEffect(() => {
      setLiveYesOdds(event.yesOdds);
      setLiveNoOdds(event.noOdds);
      setLiveOutcomes(event.outcomes);
    }, [event.yesOdds, event.noOdds, event.outcomes]);

    // Listen for real-time updates
    useEffect(() => {
      const { socket } = require('@/lib/socket');

      function onOddsUpdate(update: any) {
        if (update.eventId !== event.id) return;
        if (event.type === 'MULTIPLE' && update.outcomes) {
          // For multiple outcomes, update the outcomes array
          setLiveOutcomes(update.outcomes);
        } else {
          // For binary events, update yes/no probabilities
          setLiveYesOdds(update.yesPrice);
          setLiveNoOdds(1 - update.yesPrice);
        }
      }

      socket.on(`odds-update-${event.id}`, onOddsUpdate);

      return () => {
        socket.off(`odds-update-${event.id}`, onOddsUpdate);
      };
    }, [event.id, event.type]);

    // Fetch messages count
    const { data: messages } = useQuery({
      queryKey: ['messages', event.id],
      queryFn: async () => {
        const res = await fetch(`/api/events/${event.id}/messages`);
        if (!res.ok) return [];
        return res.json();
      },
    });

    // Format volume
    const volume = event.volume
      ? event.volume >= 1000
        ? `$${(event.volume / 1000).toFixed(1)}k`
        : `$${Math.round(event.volume)}`
      : '$0';

    const betCount = event.betCount || 0;
    const commentsCount = messages?.length || 0;

    // Use odds from props or calculate simple estimate based on bet count
    let yesOdds = 50;
    let noOdds = 50;

    if (liveYesOdds != null && liveNoOdds != null) {
      // Use real calculated odds if available
      // Check if they are already percentages (60, 40) or probabilities (0.6, 0.4)
      if (liveYesOdds > 1) {
        // Already percentages
        yesOdds = Math.round(liveYesOdds);
        noOdds = Math.round(liveNoOdds);
      } else {
        // Probabilities, convert to percentages
        yesOdds = Math.round(liveYesOdds * 100);
        noOdds = Math.round(liveNoOdds * 100);
      }
    } else if (betCount > 0) {
      // Simple estimate: assume 55/45 split for events with trades
      yesOdds = 55;
      noOdds = 45;
    }
    // Otherwise keep 50/50 default

    const toggleFavorite = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        if (isFavorite) {
          // Remove from favorites
          const res = await fetch(`/api/user/favorites?eventId=${event.id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setIsFavorite(false);
            refetchFavorites(); // Refresh the favorites list
          }
        } else {
          // Add to favorites
          const res = await fetch('/api/user/favorites', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ eventId: event.id }),
          });
          if (res.ok) {
            setIsFavorite(true);
            refetchFavorites(); // Refresh the favorites list
          }
        }
      } catch (error) {
        console.error('Error toggling favorite:', error);
      }
    };

    return (
      <Link key={event.id} href={`/event/${event.id}`} scroll={false}
        onClick={() => {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('scrollPos', window.scrollY.toString());
          }
        }}
      >
        <div
          className={`group bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-2.5 hover:bg-white/10 hover:border-white/20 transition-all duration-300 h-[180px] flex flex-col shadow-lg hover:shadow-xl ${isEnded
            ? 'opacity-60'
            : ''
            }`}
        >
          {/* Header: Image, Title, Favorite */}
          <div className="flex items-start gap-2 mb-1">
            {/* Circular Image */}
            <div className="flex-shrink-0">
              {event.imageUrl ? (
                <img
                  src={event.imageUrl}
                  alt={event.title}
                  className="w-10 h-10 rounded-full object-cover border-2 border-white/20 group-hover:border-white/40 transition-colors"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border-2 border-white/20 group-hover:border-white/40 flex items-center justify-center text-sm font-bold text-white/80 transition-colors ${event.imageUrl ? 'hidden' : ''}`}>
                {(event as any).categories && (event as any).categories.length > 0 ? (event as any).categories[0][0] : '?'}
              </div>
            </div>

            {/* Title and Favorite */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1.5">
                <h3 className="text-base font-semibold text-white line-clamp-2 leading-tight group-hover:text-white/90 transition-colors">
                  {event.title}
                </h3>
                <button
                  onClick={toggleFavorite}
                  className="flex-shrink-0 w-5 h-5 rounded-full bg-black/30 hover:bg-red-500/20 flex items-center justify-center transition-all hover:scale-110"
                >
                  <svg className={`w-3 h-3 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white/60'}`} fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Stats and Meta Info with Radial Chart */}
          <div className="flex flex-col gap-2 mb-1">
            {/* First Row: Category Tag and Time */}
            <div className="flex items-center gap-2">
              {(event as any).categories && (event as any).categories.length > 0 && (
                <span className="text-[10px] font-medium text-blue-300/80 px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10">
                  {(event as any).categories[0]}
                </span>
              )}
              <span className="text-[10px] text-gray-400 font-medium">
                {isEnded ? 'Ended' : getTimeRemaining(new Date(event.resolutionDate))}
              </span>
            </div>
            
            {/* Second Row: Radial Chart and Stats */}
            <div className="flex items-center gap-2">
              {/* Radial Chart for YES odds */}
              {event.type !== 'MULTIPLE' && (
                <div className="flex-shrink-0">
                  <ChartContainer
                    config={{
                      yesOdds: {
                        label: "YES",
                        color: "#10b981",
                      },
                    } satisfies ChartConfig}
                    className="h-12 w-12"
                  >
                    <RadialBarChart
                      data={[{ yesOdds: 100, fill: "#10b981" }]}
                      startAngle={0}
                      endAngle={360 * (yesOdds / 100)}
                      innerRadius={16}
                      outerRadius={24}
                    >
                      <RadialBar dataKey="yesOdds" cornerRadius={4} />
                      <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                        <Label
                          content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  className="fill-white text-[10px] font-bold"
                                >
                                  {yesOdds}%
                                </text>
                              );
                            }
                          }}
                        />
                      </PolarRadiusAxis>
                    </RadialBarChart>
                  </ChartContainer>
                </div>
              )}
              
              {/* Volume and Bet Count */}
              <div className="flex items-center gap-2.5 text-xs text-gray-400 flex-1">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span className="font-medium">{volume}</span>
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="font-medium">{betCount}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Odds Display */}
          {event.type === 'MULTIPLE' && (liveOutcomes || event.outcomes) ? (
             <div className="space-y-1 mt-auto">
               {(liveOutcomes || event.outcomes).slice(0, 2).map((outcome, idx) => {
                 const probability = Math.round(outcome.probability * 100);
                 return (
                   <motion.button
                     key={outcome.id}
                     onClick={(e) => {
                       e.preventDefault();
                       setSelectedMultipleEvent(event);
                       setMultipleTradingModalOpen(true);
                     }}
                     whileHover={{ scale: 1.01 }}
                     whileTap={{ scale: 0.99 }}
                     transition={{ duration: 0.2 }}
                     className="w-full bg-gray-800/50 hover:bg-gray-700/50 rounded-lg px-2.5 py-2 text-left cursor-pointer transition-colors"
                     style={{
                       borderLeftColor: outcome.color || '#666',
                       borderLeftWidth: '4px'
                     }}
                   >
                     <div className="flex justify-between items-center">
                       <span className="text-xs font-medium text-white truncate">{outcome.name}</span>
                       <span className="text-xs font-bold text-white ml-2">{probability}%</span>
                     </div>
                   </motion.button>
                 );
               })}
             </div>
           ) : (
            <div className="flex gap-1 mt-auto h-8">
              <motion.button
                onClick={(e) => {
                  e.preventDefault();
                  setSelectedEvent(event);
                  setPreselectedOption('YES');
                  setTradingModalOpen(true);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="bg-green-500/15 hover:bg-green-500/25 text-green-400 hover:text-green-300 font-semibold text-xs cursor-pointer transition-all px-1 py-1.5 rounded-lg text-center flex items-center justify-center"
                style={{ flex: `${yesOdds}` }}
              >
                <span className="truncate text-[10px]">YES</span>
              </motion.button>
              <motion.button
                onClick={(e) => {
                  e.preventDefault();
                  setSelectedEvent(event);
                  setPreselectedOption('NO');
                  setTradingModalOpen(true);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 font-semibold text-xs cursor-pointer transition-all px-1 py-1.5 rounded-lg text-center flex items-center justify-center"
                style={{ flex: `${noOdds}` }}
              >
                <span className="truncate text-[10px]">NO</span>
              </motion.button>
            </div>
          )}
        </div>
      </Link>
    );
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

              {/* Filters - Floating Right */}
              <div className="absolute right-0 top-0 flex items-center gap-3">
                {/* Time Horizon Filter */}
                <div className="flex bg-white/5 rounded-lg border border-white/10 p-1">
                  {[
                    { key: 'all', label: 'All' },
                    { key: '1d', label: '1D' },
                    { key: '1w', label: '1W' },
                    { key: '1m', label: '1M' }
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setTimeHorizon(option.key as typeof timeHorizon)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-all ${timeHorizon === option.key
                        ? 'bg-[#bb86fc]/20 text-[#bb86fc] border border-[#bb86fc]/30'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {/* Sort Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                    className="material-card px-3 py-1.5 text-xs text-gray-300 flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="absolute right-0 mt-2 w-40 material-card rounded-lg shadow-xl z-10 overflow-hidden">
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
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${sortBy === option.key
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
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
              {activeEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onMultipleTradeClick={(event) => {
                    setSelectedMultipleEvent({...event, outcomes: liveOutcomes || event.outcomes});
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {endedEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        isEnded={true}
                        onMultipleTradeClick={(event) => {
                          setSelectedMultipleEvent({...event, outcomes: liveOutcomes || event.outcomes});
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
