'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { MultipleTradingPanelModal } from './MultipleTradingPanelModal';

interface DbEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  categories?: string[]; // Multiple categories from Polymarket
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

interface EventCard2Props {
  event: DbEvent;
  isEnded?: boolean;
  onTradeClick?: (event: DbEvent, option: 'YES' | 'NO') => void;
  onMultipleTradeClick?: (event: DbEvent) => void;
}

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

export function EventCard2({ event, isEnded = false, onTradeClick, onMultipleTradeClick }: EventCard2Props) {
  const [isFavorite, setIsFavorite] = useState(false);
  const queryClient = useQueryClient();

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

  // Fetch latest odds history to seed with freshest point (binary or multiple)
  const { data: latestHistory } = useQuery({
    queryKey: ['event-latest-odds', event.id],
    enabled: Boolean(event.id),
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/events/${event.id}/odds-history?period=all`, { signal, cache: 'no-store' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
  });

  useEffect(() => {
    if (!latestHistory || latestHistory.length === 0) return;
    const last = latestHistory[latestHistory.length - 1];
    if (event.type === 'MULTIPLE' && Array.isArray(last?.outcomes)) {
      setLiveOutcomes(last.outcomes);
      return;
    }
    const latestYes = typeof last?.yesPrice === 'number' ? last.yesPrice : undefined;
    const latestNo = typeof last?.noPrice === 'number' ? last.noPrice : undefined;
    if (latestYes != null) {
      setLiveYesOdds(latestYes);
      setLiveNoOdds(latestNo != null ? latestNo : 1 - latestYes);
    } else if (latestNo != null) {
      setLiveNoOdds(latestNo);
      setLiveYesOdds(1 - latestNo);
    }
  }, [latestHistory, event.type]);

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
      const data = await res.json();
      return data.messages || [];
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

  // Calculate remaining outcomes for multiple choice events
  const totalOutcomes = (liveOutcomes || event.outcomes)?.length || 0;
  const remainingOutcomes = Math.max(0, totalOutcomes - 2);

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
          queryClient.invalidateQueries({ queryKey: ['favorite-events'] }); // Refresh favorites page
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
          queryClient.invalidateQueries({ queryKey: ['favorite-events'] }); // Refresh favorites page
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleTradeClick = (e: React.MouseEvent, option: 'YES' | 'NO') => {
    e.preventDefault();
    e.stopPropagation();
    if (onTradeClick) {
      onTradeClick(event, option);
    }
  };

  // Deterministic random color based on event ID for hover effect
  const hoverColors = [
    'hover:border-blue-500/50',
    'hover:border-purple-500/50',
    'hover:border-pink-500/50',
    'hover:border-orange-500/50',
    'hover:border-green-500/50',
    'hover:border-cyan-500/50'
  ];
  const charCodeSum = event.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hoverColorClass = hoverColors[charCodeSum % hoverColors.length];

  // Random delay for entrance animation to create organic feel
  const [randomDelay, setRandomDelay] = useState(0);
  useEffect(() => {
    setRandomDelay(Math.random() * 0.3); // 0 to 0.3s delay
  }, []);

  // Category-specific colors - Modern 2026 vibrant
  const getCategoryColor = (category: string): string => {
    const cat = category.toUpperCase();
    switch (cat) {
      case 'CRYPTO': return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'SPORTS': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'POLITICS': return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      case 'ELECTIONS': return 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10';
      case 'TECH': return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10';
      case 'BUSINESS': return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
      case 'FINANCE': return 'text-green-400 border-green-500/30 bg-green-500/10';
      case 'SCIENCE': return 'text-pink-400 border-pink-500/30 bg-pink-500/10';
      case 'CULTURE': return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      case 'ECONOMY': return 'text-teal-400 border-teal-500/30 bg-teal-500/10';
      case 'WORLD': return 'text-violet-400 border-violet-500/30 bg-violet-500/10';
      default: return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
    }
  };

  return (
    <Link
      key={event.id}
      href={`/event/${event.id}`}
      scroll={false}
      onClick={() => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('scrollPos', window.scrollY.toString());
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, delay: randomDelay, type: "spring", stiffness: 100 }}
        className={`group bg-gradient-to-br from-[#1a1f2e]/60 to-[#1a1f2e]/40 backdrop-blur-sm border border-blue-400/10 hover:border-blue-400/30 rounded-2xl p-4 transition-all duration-300 flex flex-col justify-between min-h-[210px] h-full gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_32px_rgba(59,130,246,0.15)] hover:scale-[1.02] ${isEnded ? 'opacity-50' : ''
          }`}
      >
        {/* 1. Header: Image & Title */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 relative">
            {event.imageUrl ? (
              <img
                src={event.imageUrl}
                alt={event.title}
                className="w-12 h-12 sm:w-12 sm:h-12 rounded-lg object-cover border border-blue-400/20 group-hover:border-blue-400/40 transition-all duration-300 shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
                }}
              />
            ) : null}
            <div
              className={`w-12 h-12 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 flex items-center justify-center text-sm font-bold text-blue-300 transition-all duration-300 shadow-inner ${event.imageUrl ? 'hidden' : ''
                }`}
            >
              {event.categories && event.categories.length > 0
                ? event.categories[0][0]
                : event.category 
                ? event.category[0]
                : '?'}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-1">
              <h3 className="text-[13px] font-bold text-white leading-tight line-clamp-3 group-hover:text-blue-100 transition-all duration-300">
                {event.title}
              </h3>
              <button
                onClick={toggleFavorite}
                className="flex-shrink-0 text-gray-500 hover:text-pink-400 transition-all duration-300 pt-0.5 hover:scale-110"
              >
                <svg
                  className={`w-4 h-4 ${isFavorite ? 'fill-pink-500 text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]' : 'text-gray-500'}`}
                  fill={isFavorite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Info Row: Categories & Time */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {event.categories && event.categories.length > 0 ? (
              // Show up to 2 categories with color-coding
              event.categories.slice(0, 2).map((cat, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className={`text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold ${getCategoryColor(cat)}`}
                >
                  {cat}
                </Badge>
              ))
            ) : event.category ? (
              // Fallback to single category if categories array not available
              <Badge
                variant="outline"
                className={`text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold ${getCategoryColor(event.category)}`}
              >
                {event.category}
              </Badge>
            ) : null}
          </div>
          <span className="text-[10px] font-mono font-bold text-blue-300 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-400/20 shadow-inner">{getTimeRemaining(new Date(event.resolutionDate))}</span>
        </div>

        {/* 3. Stats Row */}
        <div className="flex items-center justify-between text-white/60 px-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {volume}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {betCount}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              {commentsCount}
            </span>
          </div>

          {remainingOutcomes > 0 && event.type === 'MULTIPLE' && (
            <span className="text-[10px] font-bold text-purple-300 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-400/20">
              +{remainingOutcomes}
            </span>
          )}
        </div>

        {/* 4. Outcomes / Buttons */}
        {event.type === 'MULTIPLE' && (liveOutcomes || event.outcomes) ? (
          <div className="flex gap-2 min-h-[38px]">
            {(liveOutcomes || event.outcomes)?.slice(0, 2)
              .filter((outcome) => {
                // Filter out outcomes with invalid probabilities
                const probValue = outcome?.probability;
                if (probValue == null || probValue === undefined || probValue < 0) return false;
                const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                // Skip if 0% or 100% when there are multiple outcomes (likely invalid)
                if (probability === 0) return false;
                const totalOutcomes = (liveOutcomes || event.outcomes)?.length ?? 0;
                if (probability === 100 && totalOutcomes > 1) return false;
                return true;
              })
              .map((outcome, idx) => {
                if (!outcome) return null;
              const probValue = outcome.probability ?? 0;
              // If probValue > 1, it's already a percentage, otherwise it's 0-1 probability
              const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
              const barColor = idx === 0 ? 'bg-emerald-500' : 'bg-rose-500';
              const textColor = idx === 0 ? 'text-emerald-300' : 'text-rose-300';
              const borderColor = idx === 0 ? 'border-emerald-500/30 hover:border-emerald-400/60' : 'border-rose-500/30 hover:border-rose-400/60';
              const shadowColor = idx === 0 ? 'shadow-emerald-500/20' : 'shadow-rose-500/20';
              return (
                <motion.button
                  key={outcome.id}
                  onClick={(e) => {
                    e.preventDefault();
                    if (onMultipleTradeClick) {
                      onMultipleTradeClick(event);
                    } else {
                      window.location.href = `/event/${event.id}`;
                    }
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative flex-1 overflow-hidden bg-white/5 hover:bg-white/10 rounded-lg px-2 py-1.5 text-left cursor-pointer transition-all group/btn flex flex-col justify-center border ${borderColor} shadow-lg ${shadowColor}`}
                >
                  {/* Progress Bar Background */}
                  <div
                    className={`absolute top-0 left-0 h-full opacity-20 transition-all group-hover/btn:opacity-30 ${barColor}`}
                    style={{ width: `${probability}%` }}
                  />

                  <div className="relative z-10 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-white truncate pr-2">
                        {outcome.name}
                      </span>
                      <span className={`text-[11px] font-bold ${textColor}`}>
                        {probability}%
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-2 min-h-[38px]">
            {(() => {
              const yesVal = liveYesOdds ?? event.yesOdds ?? 0;
              const noVal = liveNoOdds ?? event.noOdds ?? 0;
              const yesDisplay = Math.min(100, Math.max(0, Math.round(yesVal > 1 ? yesVal : yesVal * 100)));
              const noDisplay = Math.min(100, Math.max(0, Math.round(noVal > 1 ? noVal : noVal * 100)));
              return (
                <>
                  <motion.button
                    onClick={(e) => handleTradeClick(e, 'YES')}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 hover:from-emerald-500/30 hover:to-emerald-600/30 rounded-xl flex items-center justify-between px-4 py-2.5 cursor-pointer transition-all duration-300 border border-emerald-400/30 hover:border-emerald-400/50 shadow-[0_4px_12px_rgba(16,185,129,0.15)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.25)]"
                  >
                    <span className="text-[12px] font-bold text-emerald-300 uppercase tracking-wide">YES</span>
                    <span className="text-[13px] font-bold text-emerald-200">{yesDisplay}%</span>
                  </motion.button>
                  <motion.button
                    onClick={(e) => handleTradeClick(e, 'NO')}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 bg-gradient-to-r from-rose-500/20 to-rose-600/20 hover:from-rose-500/30 hover:to-rose-600/30 rounded-xl flex items-center justify-between px-4 py-2.5 cursor-pointer transition-all duration-300 border border-rose-400/30 hover:border-rose-400/50 shadow-[0_4px_12px_rgba(244,63,94,0.15)] hover:shadow-[0_6px_20px_rgba(244,63,94,0.25)]"
                  >
                    <span className="text-[12px] font-bold text-rose-300 uppercase tracking-wide">NO</span>
                    <span className="text-[13px] font-bold text-rose-200">{noDisplay}%</span>
                  </motion.button>
                </>
              );
            })()}
          </div>
        )}
      </motion.div>
    </Link>
  );
}
