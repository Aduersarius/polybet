'use client';
import { Navbar } from "./components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useQuery } from '@tanstack/react-query';

interface DbEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  resolutionDate: string;
  createdAt: string;
  imageUrl?: string | null;
}

export default function Home() {
  const [showMarkets, setShowMarkets] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('hasVisitedMarkets') === 'true' || window.location.hash === '#markets';
  });
  const [selectedCategory, setSelectedCategory] = useState(() => {
    if (typeof window === 'undefined') return 'ALL';
    const saved = sessionStorage.getItem('selectedCategory');
    return saved || 'ALL';
  });
  const [sortBy, setSortBy] = useState<'volume' | 'ending' | 'newest'>('volume');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch events from database
  const { data: eventsData, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      return data as DbEvent[];
    },
  });

  const events = eventsData || [];

  // Check for hash on mount to show markets, and persist state to avoid animation replay
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if we previously showed markets or if navigating to markets
      const hasVisitedMarkets = sessionStorage.getItem('hasVisitedMarkets');
      if (hasVisitedMarkets === 'true') {
        setShowMarkets(true);
      } else if (window.location.hash === '#markets') {
        setShowMarkets(true);
        sessionStorage.setItem('hasVisitedMarkets', 'true');
      }
    }
  }, []);

  // Listen for global search events
  useEffect(() => {
    const handleGlobalSearch = (e: CustomEvent) => {
      setSearchQuery(e.detail.query);
    };
    window.addEventListener('globalSearch', handleGlobalSearch as EventListener);
    return () => window.removeEventListener('globalSearch', handleGlobalSearch as EventListener);
  }, []);

  // Save selectedCategory to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('selectedCategory', selectedCategory);
    }
  }, [selectedCategory]);

  // Check for category query param and restore scroll on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const category = urlParams.get('category');
      if (category) {
        setSelectedCategory(category);
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
    let filtered = events;

    // Filter by category
    if (selectedCategory === 'ALL') {
      filtered = events;
    } else if (selectedCategory === 'TRENDING') {
      // Show events with most activity (for now, just show all sorted by creation)
      filtered = events;
    } else if (selectedCategory === 'NEW') {
      // Show newest events
      filtered = events;
    } else if (selectedCategory === 'FAVORITES') {
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      filtered = events.filter((e: DbEvent) => favorites.includes(e.id));
    } else {
      filtered = events.filter((e: DbEvent) => (e as any).categories && (e as any).categories.includes(selectedCategory));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e: DbEvent) =>
        e.title.toLowerCase().includes(query) ||
        ((e as any).categories && (e as any).categories.some((cat: string) => cat.toLowerCase().includes(query)))
      );
    }

    const sorted = filtered.sort((a: DbEvent, b: DbEvent) => {
      if (selectedCategory === 'NEW') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'volume') return 0; // Volume not available yet
      if (sortBy === 'ending') return new Date(a.resolutionDate).getTime() - new Date(b.resolutionDate).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
    });

    const now = new Date();
    return {
      activeEvents: sorted.filter((e: DbEvent) => new Date(e.resolutionDate) > now),
      endedEvents: sorted.filter((e: DbEvent) => new Date(e.resolutionDate) <= now)
    };
  }, [selectedCategory, sortBy, searchQuery, events]);

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

    // Initialize favorite state from localStorage
    useEffect(() => {
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      setIsFavorite(favorites.includes(event.id));
    }, [event.id]);

    // Mock odds - in production, fetch from API
    const yesOdds = 65;
    const noOdds = 35;
    const volume = '$12.5k'; // Mock volume
    const betCount = 234; // Mock bet count

    const toggleFavorite = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      const newFavorites = isFavorite ? favorites.filter((id: string) => id !== event.id) : [...favorites, event.id];
      localStorage.setItem('favorites', JSON.stringify(newFavorites));
      setIsFavorite(!isFavorite);
    };

    return (
      <Link key={event.id} href={`/event/${event.id}`} scroll={false}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, scale: 1.01 }}
          className={`bg-gradient-to-br from-[#1e1e1e] to-[#181818] border border-white/10 hover:border-white/20 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-2xl hover:shadow-blue-500/20 h-80 flex flex-col ${isEnded ? 'grayscale opacity-60' : ''}`}
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
          <div className="p-4">
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
            </div>

            {/* Odds Display */}
            <div className="flex gap-2 mb-3">
              <motion.div
                whileHover={{ scale: 1.02, borderColor: 'rgba(34, 197, 94, 0.5)' }}
                transition={{ duration: 0.2 }}
                className="flex-1 bg-green-500/10 border border-green-500/30 rounded-lg p-1.5 text-center cursor-pointer hover:bg-green-500/20 transition-colors"
              >
                <div className="text-xs text-green-400 mb-0.5">YES</div>
                <div className="text-base font-bold text-white">{yesOdds}%</div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02, borderColor: 'rgba(239, 68, 68, 0.5)' }}
                transition={{ duration: 0.2 }}
                className="flex-1 bg-red-500/10 border border-red-500/30 rounded-lg p-1.5 text-center cursor-pointer hover:bg-red-500/20 transition-colors"
              >
                <div className="text-xs text-red-400 mb-0.5">NO</div>
                <div className="text-base font-bold text-white">{noOdds}%</div>
              </motion.div>
            </div>

          </div>
        </motion.div>
      </Link>
    );
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      <AnimatePresence mode="wait">
        {!showMarkets ? (
          <motion.div
            key="landing"
            initial={{ opacity: 1 }}
            exit={{
              opacity: 0,
              filter: 'blur(10px)',
              scale: 0.8,
              y: -100,
            }}
            transition={{ duration: 1.2, ease: [0.43, 0.13, 0.23, 0.96] }}
            className="fixed inset-0 flex items-center justify-center z-10"
          >
            {/* Dark Background with Gradient */}






            {/* Floating Content */}
            <div className="relative z-10 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-black/95 backdrop-blur-md border border-white/20 rounded-3xl p-10 max-w-lg mx-auto shadow-2xl shadow-purple-500/20 relative overflow-hidden"
              >
                {/* Subtle inner glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 rounded-3xl" />

                <div className="relative z-10 mb-8">
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="text-5xl font-black bg-gradient-to-r from-[#bb86fc] via-[#03dac6] to-[#bb86fc] bg-clip-text text-transparent mb-3 tracking-wide drop-shadow-lg uppercase"
                  >
                    POLYBET
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    className="text-xl text-gray-200 font-light tracking-wide leading-relaxed"
                  >
                    Decentralized Prediction Markets
                  </motion.p>
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="mb-4 relative z-10"
                >
                  <button
                    onClick={() => {
                      setShowMarkets(true);
                      if (typeof window !== 'undefined') {
                        sessionStorage.setItem('hasVisitedMarkets', 'true');
                      }
                      window.location.hash = 'markets';
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-[#bb86fc] to-[#9965f4] text-white text-base font-bold rounded-full shadow-2xl shadow-[#bb86fc]/50 hover:shadow-[0_0_40px_rgba(187,134,252,0.7)] transition-all"
                  >
                    ENTER MARKETS
                  </button>
                </motion.div>

                <p className="text-xs text-gray-400 leading-relaxed">
                  By pressing the button user agrees to the{' '}
                  <a href="/terms" className="text-[#bb86fc] hover:text-[#9965f4] underline transition-colors">
                    Terms of Use
                  </a>
                </p>
              </motion.div>
            </div>

            {/* Ambient Glow Effects */}
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#bb86fc]/10 rounded-full blur-3xl animate-pulse" style={{ zIndex: 0 }} />
            <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#03dac6]/10 rounded-full blur-3xl animate-pulse" style={{ zIndex: 0, animationDelay: '1s' }} />
          </motion.div>
        ) : (
          <motion.div
            key="markets"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="min-h-screen relative text-white z-10"
          >
            <Navbar selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} />

            {/* Markets Background */}
            <div className="fixed inset-0 z-0">


            </div>

            {/* Markets Content */}
            <div className="relative z-10 pt-[120px] px-4 max-w-7xl mx-auto pb-12">

              {/* Sort Options */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-8 flex justify-end"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Sort by:</span>
                  <div className="flex gap-1 bg-[#1e1e1e] rounded-lg p-1 border border-white/10">
                    {[
                      { value: 'volume', label: 'Volume' },
                      { value: 'ending', label: 'Ending Soon' },
                      { value: 'newest', label: 'Newest' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSortBy(option.value as any)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${sortBy === option.value
                          ? 'bg-gradient-to-r from-[#bb86fc] to-[#9965f4] text-white shadow-lg'
                          : 'text-gray-300 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
                {activeEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>

              {/* Ended Markets Section */}
              {endedEvents.length > 0 && (
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
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </main >
  );
}
