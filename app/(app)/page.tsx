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

    // Update local state if props change
    useEffect(() => {
      setLiveYesOdds(event.yesOdds);
      setLiveNoOdds(event.noOdds);
    }, [event.yesOdds, event.noOdds]);

    // Listen for real-time updates
    useEffect(() => {
      const { socket } = require('@/lib/socket');

      function onOddsUpdate(update: any) {
        if (update.eventId !== event.id) return;
        // Update provides probabilities (0-1)
        setLiveYesOdds(update.yesPrice);
        setLiveNoOdds(1 - update.yesPrice);
      }

      socket.on(`odds-update-${event.id}`, onOddsUpdate);

      return () => {
        socket.off(`odds-update-${event.id}`, onOddsUpdate);
      };
    }, [event.id]);

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
          className={`material-card group relative rounded-xl overflow-hidden h-[320px] flex flex-col ${isEnded
            ? 'opacity-70'
            : ''
            }`}
        >
          {/* Header with Image and Favorite */}
          <div className="relative h-32 overflow-hidden bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            {event.imageUrl ? (
              <img
                src={event.imageUrl}
                alt={event.title}
                className="w-full h-full object-cover opacity-50"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-white/10">
                {(event as any).categories && (event as any).categories.length > 0 ? (event as any).categories[0][0] : '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] to-transparent" />

            {/* Favorite Button */}
            <button
              onClick={toggleFavorite}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-black/70 transition-all"
            >
              <svg className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white/60'}`} fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>

            {/* Time Left Badge */}
            <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm border border-white/10 text-xs font-medium text-white/90">
              ⏱ {isEnded ? 'Ended' : getTimeRemaining(new Date(event.resolutionDate))}
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col">
            {/* Title */}
            <h3 className="text-base font-semibold leading-snug text-white line-clamp-2 mb-3">
              {event.title}
            </h3>

            {/* Category Tags */}
            {(event as any).categories && (event as any).categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(event as any).categories.slice(0, 2).map((cat: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-2 py-1 text-xs font-medium bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 border border-blue-500/30 rounded-md"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* Stats Row */}
            <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span>{volume}</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>{betCount} bets</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{commentsCount} comments</span>
              </div>
            </div>

            {/* Odds/Outcomes Display - Push to bottom */}
            {event.type === 'MULTIPLE' && event.outcomes ? (
              // Multiple outcomes display
              <div className="mt-auto">
                <div className="text-xs text-gray-400 mb-2">Top Outcomes</div>
                <div className="space-y-1">
                  {event.outcomes.slice(0, 3).map((outcome, idx) => (
                    <motion.button
                      key={outcome.id}
                      onClick={(e) => {
                        e.preventDefault();
                        // For multiple outcomes, we'll need to modify the trading modal
                        // For now, just open the event page
                        window.location.href = `/event/${event.id}`;
                      }}
                      whileHover={{ scale: 1.01 }}
                      transition={{ duration: 0.2 }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-left cursor-pointer hover:bg-white/10 transition-colors"
                      style={{
                        borderLeftColor: outcome.color || '#666',
                        borderLeftWidth: '3px'
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-white truncate">{outcome.name}</span>
                        <span className="text-sm font-bold text-white">{Math.round(outcome.probability * 100)}%</span>
                      </div>
                    </motion.button>
                  ))}
                  {event.outcomes.length > 3 && (
                    <div className="text-xs text-gray-500 text-center py-1">
                      +{event.outcomes.length - 3} more outcomes
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Binary YES/NO display
              <div className="flex gap-2 mt-auto">
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedEvent(event);
                    setPreselectedOption('YES');
                    setTradingModalOpen(true);
                  }}
                  whileHover={{ scale: 1.02, borderColor: 'rgba(34, 197, 94, 0.5)' }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 bg-green-500/10 border border-green-500/30 rounded-lg p-1.5 text-center cursor-pointer hover:bg-green-500/20 transition-colors"
                >
                  <div className="text-xs text-green-400 mb-0.5">YES</div>
                  <div className="text-base font-bold text-white">{yesOdds}%</div>
                </motion.button>
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedEvent(event);
                    setPreselectedOption('NO');
                    setTradingModalOpen(true);
                  }}
                  whileHover={{ scale: 1.02, borderColor: 'rgba(239, 68, 68, 0.5)' }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 bg-red-500/10 border border-red-500/30 rounded-lg p-1.5 text-center cursor-pointer hover:bg-red-500/20 transition-colors"
                >
                  <div className="text-xs text-red-400 mb-0.5">NO</div>
                  <div className="text-base font-bold text-white">{noOdds}%</div>
                </motion.button>
              </div>
            )}

          </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
              {activeEvents.map((event) => (
                <EventCard key={event.id} event={event} />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {endedEvents.map((event) => (
                      <EventCard key={event.id} event={event} isEnded={true} />
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
    </main>
  );
}
