'use client';
import { Navbar } from "./components/Navbar";
import { InteractiveParticles } from "./components/InteractiveParticles";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { MOCK_EVENTS } from "./data/mockEvents";

export default function Home() {
  const [showMarkets, setShowMarkets] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'volume' | 'ending' | 'newest'>('volume');

  // Check for hash on mount to show markets
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#markets') {
      setShowMarkets(true);
    }
  }, []);

  const categories = ['ALL', 'CRYPTO', 'SPORTS', 'POLITICS', 'ENTERTAINMENT'];

  const filteredAndSortedEvents = useMemo(() => {
    let filtered = selectedCategory === 'ALL'
      ? MOCK_EVENTS
      : MOCK_EVENTS.filter(e => e.category === selectedCategory);

    return filtered.sort((a, b) => {
      if (sortBy === 'volume') return b.volume - a.volume;
      if (sortBy === 'ending') return a.endsAt.getTime() - b.endsAt.getTime();
      return b.id - a.id; // newest
    });
  }, [selectedCategory, sortBy]);

  const getTimeRemaining = (endDate: Date) => {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
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
            className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center"
          >
            {/* Dark Background with Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#0f0520] to-[#0a0a0a]" style={{ zIndex: 0 }} />

            {/* Interactive Particles */}
            <InteractiveParticles />

            {/* Floating Content */}
            <div className="relative z-10 text-center">
              {/* Independently Floating Letters in POLYBET - CSS Animations for Performance */}
              <div className="text-4xl md:text-5xl font-black mb-4 flex justify-center gap-1">
                {['P', 'O', 'L', 'Y', 'B', 'E', 'T'].map((letter, i) => (
                  <span
                    key={i}
                    className="inline-block bg-gradient-to-r from-[#bb86fc] via-[#03dac6] to-[#bb86fc] bg-clip-text text-transparent drop-shadow-2xl"
                    style={{
                      backgroundSize: '200% auto',
                      animation: `float-letter-${i} ${3 + i * 0.3}s ease-in-out ${i * 0.2}s infinite, gradient ${3 + i * 0.5}s linear infinite`,
                      willChange: 'transform',
                    }}
                  >
                    {letter}
                  </span>
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
            className="min-h-screen bg-[#0a0a0a] relative text-white"
          >
            <Navbar />

            {/* Markets Background */}
            <div className="fixed inset-0 z-0">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#0f0520] to-[#0a0a0a]" />
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: 'url(/markets-bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }} />
            </div>

            {/* Markets Content */}
            <div className="relative z-10 pt-28 px-4 max-w-7xl mx-auto pb-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-8"
              >
                <h2 className="text-5xl font-bold mb-3 bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent">
                  Active Markets
                </h2>
                <p className="text-gray-400 text-lg">Place your bets on future events</p>
              </motion.div>

              {/* Filters and Sorting */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-8 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center"
              >
                {/* Category Filters */}
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat
                        ? 'bg-[#bb86fc] text-white shadow-lg shadow-[#bb86fc]/50'
                        : 'bg-[#1e1e1e] text-gray-400 hover:bg-[#2c2c2c] hover:text-white'
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Sort Options */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-[#1e1e1e] text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#bb86fc] cursor-pointer"
                  >
                    <option value="volume">Volume</option>
                    <option value="ending">Ending Soon</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {filteredAndSortedEvents.map((event, idx) => (
                  <Link key={event.id} href={`/event/${event.id}`} scroll={false}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="material-card p-0 flex flex-col h-full cursor-pointer group hover:bg-[#252525] transition-all overflow-hidden"
                    >
                      {/* Progress Bar */}
                      <div className="h-1 bg-[#1e1e1e] relative overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#bb86fc] to-[#03dac6]"
                          style={{ width: `${getProgressPercentage(event.endsAt)}%` }}
                        />
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#bb86fc] bg-[#bb86fc]/10 px-2 py-1 rounded">
                            {event.category}
                          </span>
                          <span className="text-xs text-gray-400">${(event.volume / 1000000).toFixed(1)}M</span>
                        </div>

                        <h3 className="text-base font-medium mb-4 leading-snug group-hover:text-[#bb86fc] transition-colors line-clamp-2">
                          {event.title}
                        </h3>

                        <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Ends in {getTimeRemaining(event.endsAt)} • {event.totalBets.toLocaleString()} bets
                        </div>

                        <div className="mt-auto flex gap-2">
                          <div className="flex-1 bg-[#2c2c2c] rounded px-3 py-2 text-center hover:bg-[#333] transition-colors">
                            <div className="text-[#03dac6] font-bold text-sm">Yes</div>
                            <div className="text-xs text-gray-500">{event.yesOdds}%</div>
                          </div>
                          <div className="flex-1 bg-[#2c2c2c] rounded px-3 py-2 text-center hover:bg-[#333] transition-colors">
                            <div className="text-[#cf6679] font-bold text-sm">No</div>
                            <div className="text-xs text-gray-500">{event.noOdds}%</div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes gradient {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
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
