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

  const handleTradeClick = (e: React.MouseEvent, option: 'YES' | 'NO') => {
    e.preventDefault();
    e.stopPropagation();
    if (onTradeClick) {
      onTradeClick(event, option);
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
      <div
        className={`group bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-2.5 hover:bg-white/10 hover:border-white/20 transition-all duration-300 h-[180px] flex flex-col shadow-lg hover:shadow-xl ${
          isEnded ? 'opacity-60' : ''
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
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border-2 border-white/20 group-hover:border-white/40 flex items-center justify-center text-sm font-bold text-white/80 transition-colors ${
                event.imageUrl ? 'hidden' : ''
              }`}
            >
              {(event as any).categories && (event as any).categories.length > 0
                ? (event as any).categories[0][0]
                : '?'}
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
                <svg
                  className={`w-3 h-3 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white/60'}`}
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

        {/* Stats and Meta Info - All in one section */}
        <div className="flex flex-col gap-1.5 mb-1">
          {/* First Row: Category Tag and Time */}
          <div className="flex items-center justify-between">
            {(event as any).categories && (event as any).categories.length > 0 && (
              <Badge 
                variant="outline" 
                className="text-[10px] h-5 px-2 py-0 text-blue-300/90 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
              >
                {(event as any).categories[0]}
              </Badge>
            )}
            <span className="text-[10px] text-gray-400 font-medium">
              {isEnded ? 'Ended' : getTimeRemaining(new Date(event.resolutionDate))}
            </span>
          </div>
          
          {/* Second Row: Volume and Bet Count */}
          <div className="flex items-center gap-2.5 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="font-medium">{volume}</span>
            </span>
            <span className="flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <span className="font-medium">{betCount}</span>
            </span>
          </div>
        </div>

        {/* Odds Display */}
        {event.type === 'MULTIPLE' && (liveOutcomes || event.outcomes) ? (
          <div className="space-y-1 mt-auto">
            {(liveOutcomes || event.outcomes)?.slice(0, 2).map((outcome, idx) => {
              const probability = Math.round(outcome.probability * 100);
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
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ duration: 0.2 }}
                  className="w-full bg-gray-800/50 hover:bg-gray-700/50 rounded-lg px-2.5 py-2 text-left cursor-pointer transition-colors"
                  style={{
                    borderLeftColor: outcome.color || '#666',
                    borderLeftWidth: '4px',
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-white truncate">
                      {outcome.name}
                    </span>
                    <span className="text-xs font-bold text-white ml-2">
                      {probability}%
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-1 mt-auto h-8">
            <motion.button
              onClick={(e) => handleTradeClick(e, 'YES')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="bg-green-500/15 hover:bg-green-500/25 text-green-400 hover:text-green-300 font-semibold text-xs cursor-pointer transition-all px-1 py-1.5 rounded-lg text-center flex items-center justify-center"
              style={{ flex: `${yesOdds}` }}
            >
              <span className="truncate text-[10px]">YES</span>
            </motion.button>
            <motion.button
              onClick={(e) => handleTradeClick(e, 'NO')}
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
}

