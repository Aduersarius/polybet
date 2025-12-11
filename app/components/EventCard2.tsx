'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { MultipleTradingPanelModal } from './MultipleTradingPanelModal';

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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: randomDelay }}
        className={`group bg-[#1e1e1e] border border-transparent rounded-xl p-3 sm:p-2.5 ${hoverColorClass} transition-all duration-300 flex flex-col justify-between shadow-lg min-h-[180px] h-auto gap-2 ${isEnded ? 'opacity-60' : ''
          }`}
      >
        {/* 1. Header: Image & Title */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 relative">
            {event.imageUrl ? (
              <img
                src={event.imageUrl}
                alt={event.title}
                className="w-12 h-12 sm:w-12 sm:h-12 rounded-full object-cover border border-white/10 group-hover:border-white/30 transition-colors"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
                }}
              />
            ) : null}
            <div
              className={`w-12 h-12 sm:w-12 sm:h-12 rounded-full bg-[#2a2b36] border border-white/10 flex items-center justify-center text-sm font-bold text-gray-400 transition-colors ${event.imageUrl ? 'hidden' : ''
                }`}
            >
              {(event as any).categories && (event as any).categories.length > 0
                ? (event as any).categories[0][0]
                : '?'}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-1">
              <h3 className="text-[14px] font-bold text-white leading-snug line-clamp-3 tracking-tight group-hover:text-blue-400 transition-colors">
                {event.title}
              </h3>
              <button
                onClick={toggleFavorite}
                className="flex-shrink-0 text-gray-500 hover:text-red-500 transition-colors pt-0.5"
              >
                <svg
                  className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-600'}`}
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

        {/* 2. Info Row: Category & Time */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {(event as any).categories && (event as any).categories.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-2 py-0 text-blue-300 border-blue-500/30 bg-blue-500/10 uppercase tracking-wide font-bold"
              >
                {(event as any).categories[0]}
              </Badge>
            )}
          </div>
          <span className="text-[10px] font-mono text-gray-500">{getTimeRemaining(new Date(event.resolutionDate))}</span>
        </div>

        {/* 3. Stats Row */}
        <div className="flex items-center justify-between text-gray-500 px-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {volume}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {betCount}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              {commentsCount}
            </span>
          </div>

          {remainingOutcomes > 0 && event.type === 'MULTIPLE' && (
            <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
              +{remainingOutcomes}
            </span>
          )}
        </div>

        {/* 4. Outcomes / Buttons */}
        {event.type === 'MULTIPLE' && (liveOutcomes || event.outcomes) ? (
          <div className="flex gap-2 min-h-[38px]">
            {(liveOutcomes || event.outcomes)?.slice(0, 2).map((outcome, idx) => {
              const probability = Math.round(outcome.probability * 100);
              // Use random color if outcome.color is not defined (for demo)
              const outcomeColor = outcome.color || (idx === 0 ? '#3b82f6' : '#8b5cf6');
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
                  className="relative flex-1 overflow-hidden bg-[#2a2b36] hover:bg-[#353644] rounded-lg px-2 py-1.5 text-left cursor-pointer transition-colors group/btn flex flex-col justify-center"
                >
                  {/* Progress Bar Background */}
                  <div
                    className="absolute top-0 left-0 h-full opacity-10 transition-all group-hover/btn:opacity-20"
                    style={{ width: `${probability}%`, backgroundColor: outcomeColor }}
                  />

                  <div className="relative z-10 w-full">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-[11px] font-bold text-gray-200 truncate w-full pr-1">
                        {outcome.name}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <span className="text-[11px] font-bold" style={{ color: outcomeColor }}>
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
            <motion.button
              onClick={(e) => handleTradeClick(e, 'YES')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 bg-[#1E2A25] hover:bg-[#1E3A2F] rounded-lg flex items-center justify-between px-3 sm:px-4 cursor-pointer transition-all group/yes"
            >
              <span className="text-[12px] font-bold text-green-500/90 group-hover/yes:text-green-400">YES</span>
              <span className="text-[12px] font-bold text-green-400">{yesOdds}%</span>
            </motion.button>
            <motion.button
              onClick={(e) => handleTradeClick(e, 'NO')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 bg-[#2A1E1E] hover:bg-[#3A1E1E] rounded-lg flex items-center justify-between px-3 sm:px-4 cursor-pointer transition-all group/no"
            >
              <span className="text-[12px] font-bold text-red-500/90 group-hover/no:text-red-400">NO</span>
              <span className="text-[12px] font-bold text-red-400">{noOdds}%</span>
            </motion.button>
          </div>
        )}
      </motion.div>
    </Link>
  );
}
