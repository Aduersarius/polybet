'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { MultipleTradingPanelModal } from './MultipleTradingPanelModal';
import { getCategoryColorClasses, getOutcomeColor } from '@/lib/colors';

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
  onCategoryClick?: (category: string) => void;
  index?: number;
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

const getFullTimeRemaining = (endDate: Date) => {
  const now = new Date();
  const diff = endDate.getTime() - now.getTime();
  if (diff <= 0) return "ENDED";
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  
  return parts.join(' ');
};

// Animated number component for tooltip
function AnimatedPercentage({ value, delay, duration }: { value: number; delay: number; duration: number }) {
  const [displayValue, setDisplayValue] = useState(0); // Start at 0 to animate from 0 on load
  const animationFrameRef = useRef<number | null>(null);
  const prevValueRef = useRef<number | null>(null);
  const displayValueRef = useRef(0);
  const isFirstMountRef = useRef(true);

  // Sync displayValueRef with state
  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    // Skip if value hasn't changed
    if (prevValueRef.current !== null && value === prevValueRef.current) {
      return;
    }

    // Cancel any ongoing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const isFirstMount = isFirstMountRef.current;
    isFirstMountRef.current = false;
    
    // On first mount, animate from 0 to target value immediately (no delay).
    // On subsequent changes, animate from current to new value with delay.
    const startValue = isFirstMount ? 0 : displayValueRef.current;
    const endValue = value;
    
    const startTime = Date.now();
    const totalDuration = (duration * 1000) * 1.5 || 1800; // Make it 1.5x longer for smoother animation

    // Smooth easing function (ease-out cubic)
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      
      const eased = easeOutCubic(progress);
      const current = Math.round(startValue + (endValue - startValue) * eased);
      
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        displayValueRef.current = endValue;
        prevValueRef.current = value;
        animationFrameRef.current = null;
      }
    };

    // On first mount, start immediately. On subsequent updates, use delay.
    if (isFirstMount) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      const actualDelay = delay * 1000;
      const timeoutId = setTimeout(() => {
        animationFrameRef.current = requestAnimationFrame(animate);
      }, actualDelay);
      
      return () => {
        clearTimeout(timeoutId);
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [value, delay, duration]);

  return <span>{displayValue}%</span>;
}

export function EventCard2({ event, isEnded = false, onTradeClick, onMultipleTradeClick, onCategoryClick, index = 0 }: EventCard2Props) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [isCountdownHovered, setIsCountdownHovered] = useState(false);
  const [fullTimeRemaining, setFullTimeRemaining] = useState<string>('');
  const [showOutcomesDropdown, setShowOutcomesDropdown] = useState(false);
  const outcomesDropdownRef = useRef<HTMLDivElement>(null);
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

  // Update full time remaining when hovered
  useEffect(() => {
    if (!isCountdownHovered) return;
    
    const updateFullTime = () => {
      const endDate = new Date(event.resolutionDate);
      setFullTimeRemaining(getFullTimeRemaining(endDate));
    };
    
    updateFullTime();
    const interval = setInterval(updateFullTime, 1000);
    
    return () => clearInterval(interval);
  }, [isCountdownHovered, event.resolutionDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (outcomesDropdownRef.current && !outcomesDropdownRef.current.contains(event.target as Node)) {
        setShowOutcomesDropdown(false);
      }
    };

    if (showOutcomesDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOutcomesDropdown]);


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

  // Category-specific colors - Now using centralized color system
  const getCategoryColor = getCategoryColorClasses;

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
        transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
        className={`group bg-zinc-800 border border-blue-400/10 hover:border-blue-400/30 rounded-2xl px-4 pt-4 pb-4 transition-all duration-300 flex flex-col justify-between h-[220px] w-full gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_32px_rgba(59,130,246,0.15)] hover:scale-[1.01] overflow-visible ${isEnded ? 'opacity-50' : ''
          }`}
      >
        {/* 1. Header: Image & Title */}
        <div className="flex items-start gap-2.5">
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
            <div className="flex justify-between items-start gap-2">
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
        <div className="flex items-center justify-between relative" style={{ overflowX: 'visible', overflowY: 'visible', minHeight: '28px' }}>
          <motion.div 
            className="flex items-center gap-2 flex-nowrap flex-1 -ml-1"
            animate={{
              opacity: isCountdownHovered ? 0 : 1,
            }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              pointerEvents: isCountdownHovered ? 'none' : 'auto',
            }}
          >
            {event.categories && event.categories.length > 0 ? (
              // Show up to 2 categories with color-coding
              event.categories.slice(0, 2).map((cat, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onCategoryClick) {
                      onCategoryClick(cat);
                    }
                  }}
                  className={`text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold cursor-pointer hover:scale-105 transition-transform duration-200 ${getCategoryColor(cat)}`}
                >
                  {cat}
                </Badge>
              ))
            ) : event.category ? (
              // Fallback to single category if categories array not available
              <Badge
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onCategoryClick) {
                    onCategoryClick(event.category);
                  }
                }}
                className={`text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold cursor-pointer hover:scale-105 transition-transform duration-200 ${getCategoryColor(event.category)}`}
              >
                {event.category}
              </Badge>
            ) : null}
          </motion.div>
          <div
            className="absolute right-0 z-10 top-0"
            onMouseEnter={() => setIsCountdownHovered(true)}
            onMouseLeave={() => setIsCountdownHovered(false)}
          >
            <span
              className="text-[10px] font-mono font-bold text-blue-300 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-400/20 shadow-inner cursor-pointer whitespace-nowrap inline-block"
              style={{ lineHeight: 'normal' }}
            >
              <AnimatePresence mode="wait">
                {!isCountdownHovered ? (
                  <motion.span
                    key="short-time"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="inline-block"
                  >
                    {getTimeRemaining(new Date(event.resolutionDate))}
                  </motion.span>
                ) : (
                  <motion.span
                    key="full-time"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="inline-block whitespace-nowrap"
                  >
                    {fullTimeRemaining || getFullTimeRemaining(new Date(event.resolutionDate))}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>
        </div>

        {/* 4. Outcomes / Buttons */}
        {event.type === 'MULTIPLE' && (liveOutcomes || event.outcomes) ? (
          <div className="flex flex-col gap-2.5 mt-3">
             {(() => {
               // Get all outcomes (unfiltered) to preserve original indices for color matching
               const allOutcomesUnfiltered = (liveOutcomes || event.outcomes) || [];
               
               // Get all valid outcomes with probabilities - shared between slider and buttons
               const allOutcomes = allOutcomesUnfiltered.filter((outcome) => {
                 const probValue = outcome?.probability;
                 if (probValue == null || probValue < 0) return false;
                 const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                 if (probability === 0) return false;
                 return true;
               });

               // Helper function to get outcome color - use outcome.color if available, otherwise use centralized system
               // Uses original index from unfiltered array to match event page color assignment
               const getOutcomeColorForIndex = (outcome: { id: string; color?: string }) => {
                 // If outcome has a color property, use it (from API/centralized system)
                 if (outcome?.color) {
                   return outcome.color;
                 }
                 // Find original index in unfiltered array to match event page color assignment
                 const originalIdx = allOutcomesUnfiltered.findIndex(o => o.id === outcome.id);
                 // Use centralized color system with original index
                 return getOutcomeColor(originalIdx >= 0 ? originalIdx : 0);
               };

               // Helper function to convert hex to rgba for opacity
               const hexToRgba = (hex: string, opacity: number) => {
                 const r = parseInt(hex.slice(1, 3), 16);
                 const g = parseInt(hex.slice(3, 5), 16);
                 const b = parseInt(hex.slice(5, 7), 16);
                 return `rgba(${r}, ${g}, ${b}, ${opacity})`;
               };

               // Helper function to get lighter text color from hex
               const getTextColorFromHex = (hex: string) => {
                 // Convert hex to RGB
                 const r = parseInt(hex.slice(1, 3), 16);
                 const g = parseInt(hex.slice(3, 5), 16);
                 const b = parseInt(hex.slice(5, 7), 16);
                 // Calculate luminance
                 const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                 // Return lighter version of the color for text
                 return `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
               };

               // Show top 2 outcomes for buttons (matching binary layout)
               const topOutcomes = allOutcomes.slice(0, 2);
               const buttonRemainingOutcomes = Math.max(0, allOutcomes.length - 2);

               return (
                 <>
                   <div className="relative">
                     {/* Percentage Tooltips - Show for all outcomes with >15% probability */}
                     {allOutcomes.map((outcome, idx) => {
                       const probValue = outcome.probability ?? 0;
                       const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                       
                       // Only show tooltip if probability is greater than 15%
                       if (probability <= 15) return null;
                       
                       // Calculate cumulative position for tooltip
                       const cumulativeWidth = allOutcomes.slice(0, idx).reduce((sum, o) => {
                         const p = Math.min(100, Math.max(0, Math.round((o.probability ?? 0) > 1 ? (o.probability ?? 0) : (o.probability ?? 0) * 100)));
                         return sum + p;
                       }, 0);
                       const tooltipPosition = cumulativeWidth + (probability / 2);
                       return (
                         <motion.div
                           key={`tooltip-${outcome.id}`}
                           initial={{ left: '0%', opacity: 0 }}
                           animate={{ 
                             left: `${tooltipPosition}%`,
                             opacity: probability > 0 ? 1 : 0
                           }}
                           transition={{ 
                             duration: 0.8, 
                             delay: (index * 0.05) + 0.3, 
                             ease: "easeOut" 
                           }}
                           className="absolute -top-6 -translate-x-1/2 pointer-events-none z-10"
                         >
                           <span className="text-xs font-bold text-white whitespace-nowrap">
                             <AnimatedPercentage value={probability} delay={(index * 0.05) + 0.3} duration={0.8} />
                           </span>
                         </motion.div>
                       );
                     })}
                     
                     {/* Slider with ALL outcomes */}
                     <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-rose-500/30 group/slider">
                       {allOutcomes.map((outcome, idx) => {
                         const probValue = outcome.probability ?? 0;
                         const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                         const colorHex = getOutcomeColorForIndex(outcome);
                         // Calculate left position based on cumulative width of previous outcomes
                         const leftPosition = allOutcomes.slice(0, idx).reduce((sum, o) => {
                           const p = Math.min(100, Math.max(0, Math.round((o.probability ?? 0) > 1 ? (o.probability ?? 0) : (o.probability ?? 0) * 100)));
                           return sum + p;
                         }, 0);
                         
                         return (
                           <motion.div
                             key={outcome.id}
                             initial={{ width: 0 }}
                             animate={{ width: `${probability}%` }}
                             transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                             className="absolute top-0 h-full group/segment cursor-pointer"
                             style={{ left: `${leftPosition}%`, backgroundColor: colorHex }}
                           >
                             {/* Hover tooltip with outcome name - appears above slider */}
                             <div className="absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover/segment:opacity-100 transition-opacity duration-200 pointer-events-none z-30">
                               <div className="bg-black/90 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap shadow-lg">
                                 {outcome.name}
                               </div>
                             </div>
                           </motion.div>
                         );
                       })}
                       
                       {/* Separators between outcomes */}
                       {allOutcomes.slice(0, -1).map((outcome, idx) => {
                         const cumulativeWidth = allOutcomes.slice(0, idx + 1).reduce((sum, o) => {
                           const p = Math.min(100, Math.max(0, Math.round((o.probability ?? 0) > 1 ? (o.probability ?? 0) : (o.probability ?? 0) * 100)));
                           return sum + p;
                         }, 0);
                         if (cumulativeWidth > 0 && cumulativeWidth < 100) {
                           return (
                             <motion.div 
                               key={`separator-${idx}`}
                               initial={{ left: '0%', opacity: 0 }}
                               animate={{ 
                                 left: `${cumulativeWidth}%`,
                                 opacity: 1
                               }}
                               transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                               className="absolute top-0 h-full w-[2px] bg-white/80 z-10 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                             />
                           );
                         }
                         return null;
                       })}
                     </div>
                   </div>
                   
                   <div className="flex items-center gap-2.5 min-h-[36px]">
                     {topOutcomes.map((outcome) => {
                       if (!outcome) return null;
                       const probValue = outcome.probability ?? 0;
                       const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                       const colorHex = getOutcomeColorForIndex(outcome);
                       const textColor = getTextColorFromHex(colorHex);
                       
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
                           className="group/btn relative flex-1 rounded-xl flex items-center justify-center px-3 py-2 cursor-pointer transition-all duration-300 overflow-hidden"
                           style={{ 
                             backgroundColor: hexToRgba(colorHex, 0.1),
                           }}
                           onMouseEnter={(e) => {
                             e.currentTarget.style.backgroundColor = hexToRgba(colorHex, 0.2);
                           }}
                           onMouseLeave={(e) => {
                             e.currentTarget.style.backgroundColor = hexToRgba(colorHex, 0.1);
                           }}
                         >
                           <span 
                             className="relative z-10 text-[10px] font-bold uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300 truncate max-w-full"
                             style={{ color: textColor }}
                           >
                             {outcome.name}
                           </span>
                           <span 
                             className="absolute z-10 text-[13px] font-bold opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"
                             style={{ color: textColor }}
                           >
                             {probability}%
                           </span>
                         </motion.button>
                       );
                     })}
                     {buttonRemainingOutcomes > 0 && (
                       <div ref={outcomesDropdownRef} className="relative flex-shrink-0 ml-auto">
                         <button
                           onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             setShowOutcomesDropdown(!showOutcomesDropdown);
                           }}
                           className="text-[10px] font-bold text-purple-300 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-400/20 hover:bg-purple-500/20 hover:border-purple-400/40 transition-all duration-200 cursor-pointer"
                         >
                           +{buttonRemainingOutcomes}
                         </button>
                         {showOutcomesDropdown && (
                           <motion.div
                             initial={{ opacity: 0, y: -10 }}
                             animate={{ opacity: 1, y: 0 }}
                             exit={{ opacity: 0, y: -10 }}
                             transition={{ duration: 0.2 }}
                             className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-purple-400/30 rounded-lg shadow-xl overflow-hidden min-w-[200px] max-w-[300px]"
                           >
                             <div className="max-h-[300px] overflow-y-auto">
                               {allOutcomes.slice(2, 12).map((outcome) => {
                                 const probValue = outcome.probability ?? 0;
                                 const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                                 const colorHex = getOutcomeColorForIndex(outcome);
                                 const textColor = getTextColorFromHex(colorHex);
                                 
                                 return (
                                   <button
                                     key={outcome.id}
                                     onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       if (onMultipleTradeClick) {
                                         onMultipleTradeClick(event);
                                       } else {
                                         window.location.href = `/event/${event.id}`;
                                       }
                                       setShowOutcomesDropdown(false);
                                     }}
                                     className="w-full px-3 py-2 text-left hover:bg-purple-500/10 transition-colors duration-150 border-b border-purple-400/10 last:border-b-0 flex items-center justify-between gap-2"
                                   >
                                     <span 
                                       className="text-[11px] font-semibold truncate flex-1"
                                       style={{ color: textColor }}
                                     >
                                       {outcome.name}
                                     </span>
                                     <span 
                                       className="text-[11px] font-bold flex-shrink-0"
                                       style={{ color: textColor }}
                                     >
                                       {probability}%
                                     </span>
                                   </button>
                                 );
                               })}
                             </div>
                           </motion.div>
                         )}
                       </div>
                     )}
                   </div>
                 </>
               );
             })()}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 mt-3">
             {(() => {
              const yesVal = liveYesOdds ?? event.yesOdds ?? 0;
              const noVal = liveNoOdds ?? event.noOdds ?? 0;
              const yesDisplay = Math.min(100, Math.max(0, Math.round(yesVal > 1 ? yesVal : yesVal * 100)));
              // const noDisplay = Math.min(100, Math.max(0, Math.round(noVal > 1 ? noVal : noVal * 100)));
              return (
                <div className="relative">
                  {/* Percentage Number */}
                  <motion.div
                    initial={{ left: '0%', opacity: 0 }}
                    animate={{ 
                      left: `${yesDisplay}%`,
                      opacity: yesDisplay > 0 ? 1 : 0
                    }}
                    transition={{ 
                      duration: 0.8, 
                      delay: (index * 0.05) + 0.3, 
                      ease: "easeOut" 
                    }}
                    className="absolute -top-6 -translate-x-1/2 pointer-events-none z-10"
                  >
                    <span className="text-sm font-bold text-white whitespace-nowrap">
                      <AnimatedPercentage value={yesDisplay} delay={(index * 0.05) + 0.3} duration={0.8} />
                    </span>
                  </motion.div>
                  
                  {/* Slider */}
                  <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-rose-500">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${yesDisplay}%` }}
                      transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                      className="absolute left-0 top-0 h-full bg-emerald-600" 
                    />
                    {/* Separator */}
                    {yesDisplay > 0 && yesDisplay < 100 && (
                      <motion.div 
                        initial={{ left: '0%', opacity: 0 }}
                        animate={{ 
                          left: `${yesDisplay}%`,
                          opacity: 1
                        }}
                        transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                        className="absolute top-0 h-full w-[2px] bg-white/80 z-10 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                      />
                    )}
                  </div>
                </div>
              );
             })()}
             
            <div className="flex gap-2.5 min-h-[36px]">
            {(() => {
              const yesVal = liveYesOdds ?? event.yesOdds ?? 0;
              const noVal = liveNoOdds ?? event.noOdds ?? 0;
              const yesDisplay = Math.min(100, Math.max(0, Math.round(yesVal > 1 ? yesVal : yesVal * 100)));
              const noDisplay = Math.min(100, Math.max(0, Math.round(noVal > 1 ? noVal : noVal * 100)));
              return (
                <>
                  <motion.button
                    onClick={(e) => handleTradeClick(e, 'YES')}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="group/btn relative flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl flex items-center justify-center px-3 py-2 cursor-pointer transition-all duration-300 overflow-hidden"
                  >
                    <span className="relative z-10 text-[12px] font-bold text-emerald-300 uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300">YES</span>
                    <span className="absolute z-10 text-[13px] font-bold text-emerald-200 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300">{yesDisplay}%</span>
                  </motion.button>
                  <motion.button
                    onClick={(e) => handleTradeClick(e, 'NO')}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="group/btn relative flex-1 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl flex items-center justify-center px-3 py-2 cursor-pointer transition-all duration-300 overflow-hidden"
                  >
                    <span className="relative z-10 text-[12px] font-bold text-rose-300 uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300">NO</span>
                    <span className="absolute z-10 text-[13px] font-bold text-rose-200 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300">{noDisplay}%</span>
                  </motion.button>
                </>
              );
            })()}
            </div>
          </div>
        )}

        {/* 3. Stats Row */}
        <div className="flex items-center justify-between text-white/60 pt-0.5">
          <div className="flex items-center justify-between flex-1 pr-1">
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
        </div>
      </motion.div>
    </Link>
  );
}
