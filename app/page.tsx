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
  const [showMarkets, setShowMarkets] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
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
    const [showQuickBet, setShowQuickBet] = useState(false);

    // Mock odds - in production, fetch from API
    const yesOdds = 65;
    const noOdds = 35;
    const volume = '$12.5k'; // Mock volume
    const betCount = 234; // Mock bet count

    const handleQuickBet = (e: React.MouseEvent, option: 'YES' | 'NO') => {
      e.preventDefault();
      e.stopPropagation();
      // In production, this would open a quick bet modal
      alert(`Quick bet ${option} at ${option === 'YES' ? yesOdds : noOdds}%`);
    };

    const toggleFavorite = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsFavorite(!isFavorite);
    };

    return (
      <Link key={event.id} href={`/event/${event.id}`} scroll={false}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, scale: 1.01 }}
          onHoverStart={() => setShowQuickBet(true)}
          onHoverEnd={() => setShowQuickBet(false)}
          className={`bg-gradient-to-br from-[#1e1e1e] to-[#181818] border border-white/10 hover:border-white/20 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-2xl hover:shadow-blue-500/20 ${isEnded ? 'grayscale opacity-60' : ''}`}
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
              <div className="flex-1 bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
                <div className="text-xs text-green-400 mb-1">YES</div>
                <div className="text-lg font-bold text-white">{yesOdds}%</div>
              </div>
              <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center">
                <div className="text-xs text-red-400 mb-1">NO</div>
                <div className="text-lg font-bold text-white">{noOdds}%</div>
              </div>
            </div>

            {/* Quick Bet Buttons (shown on hover) */}
            <AnimatePresence>
              {showQuickBet && !isEnded && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex gap-2"
                >
                  <button
                    onClick={(e) => handleQuickBet(e, 'YES')}
                    className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-2 px-3 rounded-lg transition-all text-sm"
                  >
                    Bet YES
                  </button>
                  <button
                    onClick={(e) => handleQuickBet(e, 'NO')}
                    className="flex-1 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-semibold py-2 px-3 rounded-lg transition-all text-sm"
                  >
                    Bet NO
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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
              {/* Independently Floating Letters in POLYBET - CSS Animations for Performance */}
              <div className="text-4xl md:text-5xl font-black mb-4 flex justify-center gap-1">
                {['P', 'O', 'L', 'Y', 'B', 'E', 'T'].map((letter, i) => (
                  <motion.span
                    key={i}
                    className="inline-block bg-gradient-to-r from-[#bb86fc] via-[#03dac6] to-[#bb86fc] bg-clip-text text-transparent drop-shadow-2xl cursor-default"
                    style={{
                      backgroundSize: '200% auto',
                    }}
                    animate={{
                      y: [0, -3, 0, 3, 0],
                      x: [0, 2, 0, -2, 0],
                      rotate: [0, 2, 0, -2, 0],
                    }}
                    transition={{
                      duration: 4 + Math.random() * 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.2,
                    }}
                    whileHover={{
                      y: -5,
                      rotate: Math.random() * 4 - 2,
                      transition: { duration: 0.2 }
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>

              {/* Floating Subtitle - CSS Animation */}
              <p
                className="text-base md:text-lg text-gray-300 mb-6 font-light tracking-wide"
                style={{
                  animation: 'float-subtitle 5s ease-in-out infinite',
                  willChange: 'transform, opacity',
                }}
              >
                Decentralized Prediction Markets
              </p>

              {/* Rock Solid Button - No floating animation */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ rotate: 5, scale: 0.95 }}
                onClick={() => {
                  setShowMarkets(true);
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('hasVisitedMarkets', 'true');
                  }
                  window.location.hash = 'markets';
                }}
                className="relative px-6 py-3 bg-gradient-to-r from-[#bb86fc] to-[#9965f4] text-white text-base font-bold rounded-full shadow-2xl shadow-[#bb86fc]/50 hover:shadow-[#bb86fc]/70 transition-all overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#9965f4] to-[#bb86fc] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10 tracking-wider">ENTER MARKETS</span>
              </motion.button>
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
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-[#1e1e1e] text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#bb86fc] cursor-pointer border border-white/10"
                  >
                    <option value="volume">Volume</option>
                    <option value="ending">Ending Soon</option>
                    <option value="newest">Newest</option>
                  </select>
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

      <style jsx global>{`
        @keyframes gradient {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }

        /* Hide scrollbar but keep functionality */
        .scrollbar-hide {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;  /* Chrome, Safari and Opera */
        }

        /* GPU-accelerated letter animations */
        @keyframes float-letter-0 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg) scale(1); }
          50% { transform: translate3d(0, -12px, 0) rotate(1deg) scale(1.03); }
        }
        @keyframes float-letter-1 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(1deg) scale(1); }
          50% { transform: translate3d(0, -14px, 0) rotate(-1deg) scale(1.03); }
        }
        @keyframes float-letter-2 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg) scale(1); }
          50% { transform: translate3d(0, -16px, 0) rotate(1deg) scale(1.03); }
        }
        @keyframes float-letter-3 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(1deg) scale(1); }
          50% { transform: translate3d(0, -18px, 0) rotate(-1deg) scale(1.03); }
        }
        @keyframes float-letter-4 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg) scale(1); }
          50% { transform: translate3d(0, -20px, 0) rotate(1deg) scale(1.03); }
        }
        @keyframes float-letter-5 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(1deg) scale(1); }
          50% { transform: translate3d(0, -22px, 0) rotate(-1deg) scale(1.03); }
        }
        @keyframes float-letter-6 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg) scale(1); }
          50% { transform: translate3d(0, -24px, 0) rotate(1deg) scale(1.03); }
        }

        /* Subtitle float animation */
        @keyframes float-subtitle {
          0%, 100% { transform: translate3d(-3px, 0, 0); opacity: 0.7; }
          50% { transform: translate3d(3px, -8px, 0); opacity: 1; }
        }
      `}</style>
    </main >
  );
}
