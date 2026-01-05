'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { MultipleTradingPanelModal } from './MultipleTradingPanelModal';
import { getCategoryColorClasses, getCategoryColor, getOutcomeColor } from '@/lib/colors';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { calculateLMSROdds } from '@/lib/amm';
import { toast } from '@/components/ui/use-toast';

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

/**
 * Helper to check if an event has multiple outcomes.
 * Both MULTIPLE and GROUPED_BINARY events should use multi-outcome UI
 * (carousel, segment slider, etc.) since they both have 3+ outcomes.
 */
const isMultiOutcomeEvent = (type?: string): boolean => {
  return type === 'MULTIPLE' || type === 'GROUPED_BINARY';
};

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
function AnimatedPercentage({ value, delay, duration, skipAnimation = false }: { value: number; delay: number; duration: number; skipAnimation?: boolean }) {
  const [displayValue, setDisplayValue] = useState(skipAnimation ? value : 0); // Start at value if skipping animation
  const animationFrameRef = useRef<number | null>(null);
  const prevValueRef = useRef<number | null>(null);
  const displayValueRef = useRef(skipAnimation ? value : 0);
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

    // If skipAnimation is true, just set the value directly
    if (skipAnimation) {
      setDisplayValue(value);
      displayValueRef.current = value;
      prevValueRef.current = value;
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
  }, [value, delay, duration, skipAnimation]);

  return <span>{displayValue}%</span>;
}

// Simple component to display hovered text centered on segment
// Uses the same positioning approach as the non-hover percentage numbers
// Constrains position to respect container padding
const HoveredTextDisplay = React.forwardRef<HTMLDivElement, {
  segmentCenter: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  textClassName?: string;
}>(({ segmentCenter, containerRef, children, textClassName = 'text-xs' }, ref) => {
  const [leftPosition, setLeftPosition] = useState<string>(`${segmentCenter}%`);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const calculatePosition = () => {
      if (!containerRef?.current || !textRef.current) {
        setLeftPosition(`${segmentCenter}%`);
        return;
      }

      const container = containerRef.current;
      const textElement = textRef.current;

      // Get container dimensions
      const containerWidth = container.offsetWidth;

      // Get text element width
      const textWidth = textElement.offsetWidth;

      // Calculate desired center position in pixels
      const desiredCenterPx = (containerWidth * segmentCenter) / 100;

      // Calculate half text width for centering (since we use translateX(-50%))
      const halfTextWidth = textWidth / 2;

      // Constrain to container bounds - get as close to edges as possible
      // The slider container is already inside EventCard padding, so use minimal margin
      // Allow text to get very close to container edges (2px margin for safety)
      const margin = 2;
      // Minimum: center position where left edge of text is at margin
      const minCenter = margin + halfTextWidth;
      // Maximum: center position where right edge of text is at margin
      const maxCenter = containerWidth - margin - halfTextWidth;

      // Clamp the position to stay within bounds
      const clampedCenterPx = Math.max(minCenter, Math.min(maxCenter, desiredCenterPx));

      // Convert back to percentage
      const clampedPercent = (clampedCenterPx / containerWidth) * 100;

      setLeftPosition(`${clampedPercent}%`);
    };

    // Calculate on mount and when dependencies change
    const rafId = requestAnimationFrame(() => {
      calculatePosition();
    });

    // Also recalculate on window resize
    const handleResize = () => {
      calculatePosition();
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver to watch for container size changes
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef?.current) {
      resizeObserver = new ResizeObserver(() => {
        calculatePosition();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [containerRef, segmentCenter, children]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, left: leftPosition }}
      animate={{ opacity: 1, left: leftPosition }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute -top-6 -translate-x-1/2 pointer-events-none z-20"
    >
      <span ref={textRef} className={`font-bold text-gray-400 whitespace-nowrap ${textClassName}`}>
        {children}
      </span>
    </motion.div>
  );
});

HoveredTextDisplay.displayName = 'HoveredTextDisplay';

export function EventCard2({ event, isEnded = false, onTradeClick, onMultipleTradeClick, onCategoryClick, index = 0 }: EventCard2Props) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [isCountdownHovered, setIsCountdownHovered] = useState(false);
  const [fullTimeRemaining, setFullTimeRemaining] = useState<string>('');
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const scrollInactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const outcomesCarouselRef = useRef<HTMLDivElement>(null);
  const countdownShortRef = useRef<HTMLSpanElement>(null);
  const countdownFullRef = useRef<HTMLSpanElement>(null);
  const binaryButtonRef = useRef<HTMLButtonElement>(null);
  const binaryButtonContainerRef = useRef<HTMLDivElement>(null);
  const [countdownWidth, setCountdownWidth] = useState<number | 'auto'>('auto');
  const [binaryButtonWidth, setBinaryButtonWidth] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const hasAnimatedRef = useRef(false); // Track if initial animation has completed
  const initialOutcomesRef = useRef<typeof event.outcomes | null>(null); // Store initial outcomes to prevent recalculation
  const segmentDataRef = useRef<any[] | null>(null); // Lock segment data after first calculation
  const lockedOutcomesRef = useRef<typeof event.outcomes | null>(null); // Lock outcomes used for segment calculation
  const percentagesShownRef = useRef(false); // Track if percentages have been shown before
  const binaryPercentageAnimatedRef = useRef(false); // Track if binary percentage animation has played
  const hoveredTextRef = useRef<HTMLDivElement>(null); // Ref to measure hovered text width
  const sliderContainerRef = useRef<HTMLDivElement>(null); // Ref to measure slider container width
  const isHoveringSliderRef = useRef(false); // Track if currently hovering over slider
  const hasEverHoveredRef = useRef(false); // Track if user has ever hovered over slider
  const [showBuyInterface, setShowBuyInterface] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string>('YES');
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);
  const [selectedOutcomeName, setSelectedOutcomeName] = useState<string>('');
  const [buyAmount, setBuyAmount] = useState<string>('10');
  const [currentPrice, setCurrentPrice] = useState<number>(0.5);
  const [isLoading, setIsLoading] = useState(false);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [balancePct, setBalancePct] = useState<number>(0);

  // Real-time odds state (declare before use in useEffect)
  const [liveYesOdds, setLiveYesOdds] = useState(event.yesOdds);
  const [liveNoOdds, setLiveNoOdds] = useState(event.noOdds);
  const [liveOutcomes, setLiveOutcomes] = useState(event.outcomes);

  // Fetch event data for odds calculation
  const { data: eventData } = useQuery({
    queryKey: ['event', event.id],
    queryFn: async () => {
      const response = await fetch(`/api/events/${event.id}`);
      if (!response.ok) throw new Error('Failed to fetch event');
      return await response.json();
    },
    staleTime: 30000,
  });

  // Fetch user balance for max button
  const { data: balanceData } = useQuery({
    queryKey: ['user-balance'],
    queryFn: async () => {
      const response = await fetch('/api/balance');
      if (!response.ok) return { balance: 0 };
      return await response.json();
    },
    enabled: showBuyInterface,
    staleTime: 10000,
  });

  useEffect(() => {
    if (balanceData?.balance !== undefined) {
      const balance = typeof balanceData.balance === 'number'
        ? balanceData.balance
        : parseFloat(balanceData.balance) || 0;
      setUserBalance(balance);
    } else {
      setUserBalance(0);
    }
  }, [balanceData]);

  // Calculate current price/odds
  useEffect(() => {
    if (!showBuyInterface) return;

    if (isMultiOutcomeEvent(event.type) && selectedOutcomeId) {
      // For multiple outcomes, find the selected outcome
      const outcomes = liveOutcomes || event.outcomes || [];
      const selectedOutcome = outcomes.find((o: any) => o.id === selectedOutcomeId);
      if (selectedOutcome) {
        const prob = selectedOutcome.probability ?? 0;
        const p = prob > 1 ? prob / 100 : prob;
        // For Grouped Binary, checking NO option
        setCurrentPrice(event.type === 'GROUPED_BINARY' && selectedOption === 'NO' ? 1 - p : p);
      }
    } else if (eventData) {
      if (eventData.qYes !== undefined && eventData.qNo !== undefined) {
        const b = eventData.liquidityParameter || 10000.0;
        const odds = calculateLMSROdds(eventData.qYes, eventData.qNo, b);
        setCurrentPrice(selectedOption === 'YES' ? odds.yesPrice : odds.noPrice);
      } else if (eventData.yesOdds !== undefined && eventData.noOdds !== undefined) {
        setCurrentPrice(selectedOption === 'YES' ? eventData.yesOdds : eventData.noOdds);
      } else if (event.yesOdds !== undefined && event.noOdds !== undefined) {
        setCurrentPrice(selectedOption === 'YES' ? event.yesOdds : event.noOdds);
      }
    } else if (event.yesOdds !== undefined && event.noOdds !== undefined) {
      setCurrentPrice(selectedOption === 'YES' ? event.yesOdds : event.noOdds);
    }
  }, [eventData, event, selectedOption, selectedOutcomeId, showBuyInterface, liveOutcomes]);

  // Listen for real-time odds updates across the entire app
  useEffect(() => {
    const { socket } = require('@/lib/socket');

    function onOddsUpdate(update: any) {
      if (update.eventId !== event.id) return;

      // Update primary odds state for buttons and card display
      if (update.yesPrice !== undefined) {
        const p = update.yesPrice > 1 ? update.yesPrice / 100 : update.yesPrice;
        setLiveYesOdds(p);
        // Ensure noOdds is kept in sync if not provided
        if (update.noPrice === undefined && event.type === 'BINARY') {
          setLiveNoOdds(1 - p);
        }
      }
      if (update.noPrice !== undefined) {
        const p = update.noPrice > 1 ? update.noPrice / 100 : update.noPrice;
        setLiveNoOdds(p);
        // Ensure yesOdds is kept in sync if not provided
        if (update.yesPrice === undefined && event.type === 'BINARY') {
          setLiveYesOdds(1 - p);
        }
      }
      if (update.outcomes) setLiveOutcomes(update.outcomes);

      // If trading interface is open, also update the active trade price
      if (showBuyInterface) {
        if (isMultiOutcomeEvent(event.type) && update.outcomes && selectedOutcomeId) {
          const selectedOutcome = update.outcomes.find((o: any) => o.id === selectedOutcomeId);
          if (selectedOutcome) {
            const prob = selectedOutcome.probability ?? 0;
            const p = prob > 1 ? prob / 100 : prob;
            setCurrentPrice(event.type === 'GROUPED_BINARY' && selectedOption === 'NO' ? 1 - p : p);
          }
        } else if (update.yesPrice !== undefined) {
          const p = update.yesPrice > 1 ? update.yesPrice / 100 : update.yesPrice;
          setCurrentPrice(selectedOption === 'YES' ? p : (1 - p));
        } else if (update.noPrice !== undefined) {
          const p = update.noPrice > 1 ? update.noPrice / 100 : update.noPrice;
          setCurrentPrice(selectedOption === 'NO' ? p : (1 - p));
        }
      }
    }

    socket.on(`odds-update-${event.id}`, onOddsUpdate);

    return () => {
      socket.off(`odds-update-${event.id}`, onOddsUpdate);
    };
  }, [event.id, event.type, selectedOption, selectedOutcomeId, showBuyInterface]);

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


  // Store initial outcomes on first render
  useLayoutEffect(() => {
    if (initialOutcomesRef.current === null && event.outcomes) {
      initialOutcomesRef.current = event.outcomes;
    }
  }, [event.outcomes]);

  // Update local state if props change
  useEffect(() => {
    setLiveYesOdds(event.yesOdds);
    setLiveNoOdds(event.noOdds);
    // Only update liveOutcomes if we haven't locked segment data yet
    if (segmentDataRef.current === null) {
      setLiveOutcomes(event.outcomes);
    }
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

  // Measure and animate countdown width
  useEffect(() => {
    const measureWidth = () => {
      if (isCountdownHovered && countdownFullRef.current) {
        const width = countdownFullRef.current.offsetWidth;
        setCountdownWidth(width);
      } else if (!isCountdownHovered && countdownShortRef.current) {
        const width = countdownShortRef.current.offsetWidth;
        setCountdownWidth(width);
      }
    };

    // Measure after a brief delay to ensure elements are rendered
    const timeoutId = setTimeout(measureWidth, 0);
    return () => clearTimeout(timeoutId);
  }, [isCountdownHovered, fullTimeRemaining]);

  // Initial width measurement on mount
  useEffect(() => {
    if (countdownShortRef.current && countdownWidth === 'auto') {
      const width = countdownShortRef.current.offsetWidth;
      setCountdownWidth(width);
    }
  }, []);

  // Measure binary button width to apply to multiple outcome buttons
  useEffect(() => {
    // For binary events, measure the actual button width from the button itself
    if (!isMultiOutcomeEvent(event.type) && binaryButtonRef.current && !binaryButtonWidth) {
      const measureWidth = () => {
        if (binaryButtonRef.current) {
          const buttonWidth = binaryButtonRef.current.offsetWidth;
          if (buttonWidth > 0) {
            setBinaryButtonWidth(buttonWidth);
          }
        }
      };

      // Measure after render
      const timeoutId = setTimeout(measureWidth, 0);
      window.addEventListener('resize', measureWidth);

      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('resize', measureWidth);
      };
    }

    // For multiple events, calculate based on carousel container width
    // The carousel has -mx-1 px-1 which means:
    // - Extends 4px beyond parent on each side (8px total extension)
    // - Adds 4px padding on each side (8px total padding)
    // - clientWidth includes the padding, so content width = clientWidth - 8px
    // Binary buttons container is just "flex gap-2.5" with same parent, so its width matches content width
    // Binary buttons use flex-1 with gap-2.5 (10px), so each button is (contentWidth - 10px) / 2
    if (isMultiOutcomeEvent(event.type) && outcomesCarouselRef.current && !binaryButtonWidth) {
      const measureWidth = () => {
        if (outcomesCarouselRef.current) {
          // Get the scrollable content width (excluding padding)
          // The carousel's scrollWidth gives us the actual content width
          // But we need the container width. clientWidth includes padding (8px total)
          const contentWidth = outcomesCarouselRef.current.clientWidth - 8;
          // Binary buttons use flex-1 with gap-2.5 (10px), so each button is (width - 10px) / 2
          const buttonWidth = (contentWidth - 10) / 2;
          if (buttonWidth > 0) {
            setBinaryButtonWidth(buttonWidth);
          }
        }
      };

      // Measure after render
      const timeoutId = setTimeout(measureWidth, 0);
      window.addEventListener('resize', measureWidth);

      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('resize', measureWidth);
      };
    }
  }, [event.type, binaryButtonWidth]);

  // Check if carousel is scrollable and show/hide arrows accordingly
  useEffect(() => {
    if (!outcomesCarouselRef.current || !isMultiOutcomeEvent(event.type)) return;

    const checkScrollable = () => {
      const carousel = outcomesCarouselRef.current;
      if (!carousel) return;

      const isScrollable = carousel.scrollWidth > carousel.clientWidth;
      const isAtStart = carousel.scrollLeft <= 5;
      const isAtEnd = carousel.scrollWidth - carousel.scrollLeft <= carousel.clientWidth + 5;

      if (!isScrollable) {
        setShowRightArrow(false);
        setShowLeftArrow(false);
      } else {
        // Show right arrow if not at end
        setShowRightArrow(!isAtEnd);
        // Show left arrow if not at start
        setShowLeftArrow(!isAtStart);
      }
    };

    // Check initially and after a short delay to ensure DOM is ready
    checkScrollable();
    const timeoutId = setTimeout(checkScrollable, 100);

    // Also check on window resize
    window.addEventListener('resize', checkScrollable);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [liveOutcomes, event.outcomes, event.type]);

  // Cleanup scroll inactivity timer on unmount
  useEffect(() => {
    return () => {
      if (scrollInactivityTimerRef.current) {
        clearTimeout(scrollInactivityTimerRef.current);
      }
    };
  }, []);

  // Mark binary animation as complete after initial animation duration
  useEffect(() => {
    if (!isMultiOutcomeEvent(event.type) && !binaryPercentageAnimatedRef.current) {
      const animationDuration = 0.8;
      const delay = (index * 0.05) + 0.3;
      const totalTime = (delay + animationDuration) * 1000;
      const timer = setTimeout(() => {
        binaryPercentageAnimatedRef.current = true;
      }, totalTime);
      return () => clearTimeout(timer);
    }
  }, [event.type, index]);

  // Mark non-binary animation as complete after initial animation duration
  useEffect(() => {
    if (isMultiOutcomeEvent(event.type) && !percentagesShownRef.current && segmentDataRef.current) {
      const maxSegmentDelay = Math.max(...segmentDataRef.current.map(s => s.segmentDelay), 0);
      const animationDuration = 0.8;
      const delay = (index * 0.05) + 0.3;
      const totalTime = (delay + maxSegmentDelay + animationDuration) * 1000;
      const timer = setTimeout(() => {
        percentagesShownRef.current = true;
      }, totalTime);
      return () => clearTimeout(timer);
    }
  }, [event.type, index]);



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

  // Sync latest history data before first render to ensure correct initial values
  useLayoutEffect(() => {
    // If we have latestHistory data and haven't locked segmentData yet, use it
    if (latestHistory && latestHistory.length > 0 && segmentDataRef.current === null) {
      const last = latestHistory[latestHistory.length - 1];
      if (isMultiOutcomeEvent(event.type) && Array.isArray(last?.outcomes)) {
        setLiveOutcomes(last.outcomes);
        if (initialOutcomesRef.current === null) {
          initialOutcomesRef.current = last.outcomes;
        }
      }
    }
  }, [latestHistory, event.type]);

  useEffect(() => {
    if (!latestHistory || latestHistory.length === 0) return;
    const last = latestHistory[latestHistory.length - 1];
    if (isMultiOutcomeEvent(event.type) && Array.isArray(last?.outcomes)) {
      // Only update if we haven't locked segment data yet - this prevents animation restart
      if (segmentDataRef.current === null) {
        setLiveOutcomes(last.outcomes);
        // Store as initial outcomes if not set yet
        if (initialOutcomesRef.current === null) {
          initialOutcomesRef.current = last.outcomes;
        }
      }
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
      if (isMultiOutcomeEvent(event.type) && update.outcomes) {
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
    setSelectedOption(option);
    setSelectedOutcomeId(null);
    setSelectedOutcomeName(event.title);
    setShowBuyInterface(true);
  };

  const handleGroupedTradeClick = (e: React.MouseEvent, outcomeId: string, outcomeName: string, option: 'YES' | 'NO') => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOutcomeId(outcomeId);
    setSelectedOutcomeName(outcomeName);
    setSelectedOption(option);
    setShowBuyInterface(true);
  };

  const handleMultipleTradeClick = (e: React.MouseEvent, outcomeId: string, outcomeName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOption(outcomeName);
    setSelectedOutcomeId(outcomeId);
    setSelectedOutcomeName(outcomeName);
    setShowBuyInterface(true);
  };

  const handleCloseBuy = () => {
    setShowBuyInterface(false);
  };

  const handleAmountChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setBuyAmount(value);
      // Update balance percentage when amount changes manually
      if (userBalance > 0) {
        const pct = Math.min(100, Math.max(0, (num / userBalance) * 100));
        setBalancePct(pct);
      }
    } else if (value === '' || value === '.') {
      setBuyAmount(value);
      setBalancePct(0);
    }
  };

  const incrementAmount = (increment: number) => {
    const current = parseFloat(buyAmount) || 0;
    const newAmount = Math.max(0, current + increment);
    setBuyAmount(newAmount.toString());
    // Update balance percentage
    if (userBalance > 0) {
      const pct = Math.min(100, Math.max(0, (newAmount / userBalance) * 100));
      setBalancePct(pct);
    }
  };

  const setMaxAmount = () => {
    if (userBalance > 0) {
      setBuyAmount(userBalance.toString());
      setBalancePct(100);
    }
  };

  const handleBuy = async () => {
    const amountNum = parseFloat(buyAmount) || 0;
    if (amountNum <= 0) return;

    setIsLoading(true);
    try {
      // For multiple outcomes, use outcome name; for binary, use YES/NO
      const isGrouped = event.type === 'GROUPED_BINARY';
      const optionValue = isMultiOutcomeEvent(event.type) && selectedOutcomeId && !isGrouped
        ? selectedOption // Use outcome name for multiple
        : selectedOption; // YES/NO for binary/grouped

      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          option: optionValue,
          amount: amountNum,
          outcomeId: selectedOutcomeId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setShowBuyInterface(false);
        // Reset buy amount after successful purchase
        setBuyAmount('10');
        setBalancePct(0);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['event', event.id] });
        queryClient.invalidateQueries({ queryKey: ['user-balance'] });
        // Show success notification
        toast({
          variant: 'success',
          title: 'Trade successful',
          description: `Bought ${amountNum.toFixed(2)} ${selectedOption} tokens`,
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Trade failed');
      }
    } catch (error) {
      console.error('Trade error:', error);
      toast({
        variant: 'destructive',
        title: 'Trade failed',
        description: error instanceof Error ? error.message : 'An error occurred while placing your trade',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get outcome color for buy button
  const getBuyButtonColor = () => {
    if (isMultiOutcomeEvent(event.type) && selectedOutcomeId) {
      const outcomes = liveOutcomes || event.outcomes || [];
      const selectedOutcome = outcomes.find((o: any) => o.id === selectedOutcomeId);
      if (selectedOutcome?.color) {
        return selectedOutcome.color;
      }
      // Find index for color system
      const allOutcomes = outcomes || [];
      const idx = allOutcomes.findIndex((o: any) => o.id === selectedOutcomeId);
      return getOutcomeColor(idx >= 0 ? idx : 0);
    } else if (selectedOption === 'YES') {
      return '#10b981'; // Green for YES
    } else {
      return '#f43f5e'; // Red for NO
    }
  };

  const buyButtonColor = getBuyButtonColor();

  // Helper to darken color for hover
  const darkenColor = (hex: string, amount: number = 0.1) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const newR = Math.max(0, Math.min(255, Math.round(r * (1 - amount))));
    const newG = Math.max(0, Math.min(255, Math.round(g * (1 - amount))));
    const newB = Math.max(0, Math.min(255, Math.round(b * (1 - amount))));
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  };

  // Calculate win amount
  const amountNum = parseFloat(buyAmount) || 0;
  const price = currentPrice > 1 ? currentPrice / 100 : currentPrice;
  const winAmount = price > 0 ? (amountNum / price) - amountNum : 0;

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
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
  // getCategoryColor returns color objects for inline styles, getCategoryColorClasses returns Tailwind classes

  // Helper function to desaturate/mute a hex color by mixing with gray
  const muteColor = (hex: string, desaturation: number = 0.4) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Mix with gray (128, 128, 128) to desaturate
    const grayR = 128;
    const grayG = 128;
    const grayB = 128;

    const mutedR = Math.round(r * (1 - desaturation) + grayR * desaturation);
    const mutedG = Math.round(g * (1 - desaturation) + grayG * desaturation);
    const mutedB = Math.round(b * (1 - desaturation) + grayB * desaturation);

    return `#${mutedR.toString(16).padStart(2, '0')}${mutedG.toString(16).padStart(2, '0')}${mutedB.toString(16).padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full pt-2 pb-6 -mb-6" style={{ overflow: 'visible' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          opacity: { duration: 0.2, delay: index * 0.05, ease: "easeOut" },
          y: { duration: 0.2, delay: index * 0.05, ease: "easeOut" }
        }}
        className="relative w-full h-[220px]"
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)'
        }}
      >
        {/* Normal Card View */}
        <motion.div
          key={event.id}
          className="absolute inset-0 w-full h-full"
          animate={{
            opacity: showBuyInterface ? 0 : 1,
            pointerEvents: showBuyInterface ? 'none' : 'auto',
            x: showBuyInterface ? -20 : 0
          }}
          transition={{ duration: 0.2 }}
        >
          <Link
            href={`/event/${event.id}`}
            scroll={false}
            onClick={() => {
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('scrollPos', window.scrollY.toString());
              }
            }}
            className="w-full h-full block"
            style={{ overflow: 'visible' }}
          >
            <motion.div
              transition={{ duration: 0.15, delay: 0, ease: "easeOut" }}
              style={{ backgroundColor: 'var(--surface)', overflow: 'visible' }}
              className={`group border border-blue-400/10 hover:border-blue-400/30 rounded-2xl px-4 pt-4 pb-4 transition-colors transition-shadow duration-200 flex flex-col h-[220px] w-full gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] relative ${isEnded ? 'opacity-50' : ''
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
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{
                    pointerEvents: isCountdownHovered ? 'none' : 'auto',
                  }}
                >
                  {event.categories && event.categories.length > 0 ? (
                    // Show up to 2 categories with color-coding
                    event.categories.slice(0, 2).map((cat, idx) => {
                      // Use inline styles to ensure colors are applied (bypasses any CSS conflicts)
                      const colorObj = getCategoryColor(cat) as { text: string; border: string; bg: string };
                      // Debug: log category and colors in development
                      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
                        console.log('[EventCard2] Category:', cat, 'Colors:', colorObj);
                      }
                      return (
                        <div
                          key={idx}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (onCategoryClick) {
                              onCategoryClick(cat);
                            }
                          }}
                          style={{
                            color: colorObj.text,
                            borderColor: colorObj.border,
                            backgroundColor: colorObj.bg,
                          }}
                          className="inline-flex items-center rounded-full border text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold cursor-pointer hover:scale-105 transition-transform duration-200"
                        >
                          {cat}
                        </div>
                      );
                    })
                  ) : event.category ? (
                    // Fallback to single category if categories array not available
                    (() => {
                      const colorObj = getCategoryColor(event.category) as { text: string; border: string; bg: string };
                      return (
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (onCategoryClick) {
                              onCategoryClick(event.category);
                            }
                          }}
                          style={{
                            color: colorObj.text,
                            borderColor: colorObj.border,
                            backgroundColor: colorObj.bg,
                          }}
                          className="inline-flex items-center rounded-full border text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold cursor-pointer hover:scale-105 transition-transform duration-200"
                        >
                          {event.category}
                        </div>
                      );
                    })()
                  ) : null}
                </motion.div>
                <div
                  className="absolute right-0 z-10 flex items-center"
                  style={{ top: 0, bottom: 0 }}
                  onMouseEnter={() => setIsCountdownHovered(true)}
                  onMouseLeave={() => setIsCountdownHovered(false)}
                >
                  {/* Hidden spans to measure widths */}
                  <div className="absolute opacity-0 pointer-events-none" style={{ visibility: 'hidden' }}>
                    <span ref={countdownShortRef} className="text-[10px] font-mono font-bold px-2 py-0 h-5 whitespace-nowrap inline-flex items-center">
                      {getTimeRemaining(new Date(event.resolutionDate))}
                    </span>
                    <span ref={countdownFullRef} className="text-[10px] font-mono font-bold px-2 py-0 h-5 whitespace-nowrap inline-flex items-center">
                      {fullTimeRemaining || getFullTimeRemaining(new Date(event.resolutionDate))}
                    </span>
                  </div>

                  <motion.div
                    className="text-[10px] font-mono font-bold text-blue-300 bg-blue-500/10 px-2 py-0 h-5 rounded-lg border border-blue-400/20 shadow-inner cursor-pointer whitespace-nowrap overflow-hidden inline-flex items-center"
                    style={{
                      lineHeight: 'normal',
                    }}
                    animate={{
                      width: countdownWidth === 'auto' ? 'auto' : `${countdownWidth}px`,
                    }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
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
                  </motion.div>
                </div>
              </div>

              {/* 4. Outcomes / Buttons */}
              {isMultiOutcomeEvent(event.type) && (liveOutcomes || event.outcomes) ? (
                <div className="flex flex-col gap-2.5 mt-3">
                  {event.type === 'GROUPED_BINARY' ? (
                    // Vertical list for Grouped Binary
                    (() => {
                      // Helper function to convert hex to rgba for opacity (same as binary card)
                      const hexToRgba = (hex: string, opacity: number) => {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                      };

                      return (
                        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent space-y-1.5 max-h-[60px]">
                          {(liveOutcomes || event.outcomes || []).map((outcome, idx) => {
                            const probability = outcome.probability ?? 0;
                            const percentage = probability > 1 ? probability : Math.round(probability * 100);

                            return (
                              <div key={outcome.id || idx} className="flex items-center gap-2 pr-1">
                                {/* Outcome Name */}
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                  <span className="text-gray-300 text-xs font-medium truncate group-hover/card:text-white transition-colors">
                                    {outcome.name}
                                  </span>
                                  <span className="text-gray-400 text-xs font-bold whitespace-nowrap">
                                    {percentage}%
                                  </span>
                                </div>

                                {/* Buttons Container - matching binary card style with hover effects */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <motion.button
                                    whileHover={{ backgroundColor: hexToRgba('#10b981', 0.2) }}
                                    whileTap={{ opacity: 0.9 }}
                                    onClick={(e) => handleGroupedTradeClick(e, outcome.id, outcome.name, 'YES')}
                                    className="group/btn relative w-12 h-6 rounded-lg font-bold text-[10px] overflow-hidden transition-all duration-200 flex items-center justify-center"
                                    style={{ backgroundColor: hexToRgba('#10b981', 0.1) }}
                                  >
                                    <span
                                      className="relative z-10 uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300"
                                      style={{ color: '#10b981' }}
                                    >Yes</span>
                                    <span
                                      className="absolute z-10 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"
                                      style={{ color: '#10b981' }}
                                    >{percentage}%</span>
                                  </motion.button>

                                  <motion.button
                                    whileHover={{ backgroundColor: hexToRgba('#f43f5e', 0.2) }}
                                    whileTap={{ opacity: 0.9 }}
                                    onClick={(e) => handleGroupedTradeClick(e, outcome.id, outcome.name, 'NO')}
                                    className="group/btn relative w-12 h-6 rounded-lg font-bold text-[10px] overflow-hidden transition-all duration-300 flex items-center justify-center"
                                    style={{ backgroundColor: hexToRgba('#f43f5e', 0.1) }}
                                  >
                                    <span
                                      className="relative z-10 uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300"
                                      style={{ color: '#f43f5e' }}
                                    >No</span>
                                    <span
                                      className="absolute z-10 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"
                                      style={{ color: '#f43f5e' }}
                                    >{100 - percentage}%</span>
                                  </motion.button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      // Use live outcomes for constant real-time correctness
                      const outcomesForCalculation = liveOutcomes || event.outcomes;

                      // Get all outcomes (unfiltered) to preserve original indices for color matching
                      const allOutcomesUnfiltered = outcomesForCalculation || [];

                      // Get all valid outcomes with probabilities - shared between slider and buttons
                      // Include outcomes with 0% probability - they're still valid choices
                      const allOutcomes = useMemo(() => {
                        return allOutcomesUnfiltered.filter((outcome) => {
                          const probValue = outcome?.probability;
                          // Only filter out truly invalid outcomes (null/undefined/negative)
                          // Keep 0% outcomes as they're valid choices users can bet on
                          if (probValue == null || probValue < 0) return false;
                          return true;
                        });
                      }, [allOutcomesUnfiltered]);

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

                      // Helper function to get muted text color from hex (same muting as slider)
                      const getTextColorFromHex = (hex: string) => {
                        // Use the same muteColor function with 0.4 desaturation as the slider
                        return muteColor(hex, 0.4);
                      };

                      // Pre-calculate ALL segment positions BEFORE rendering - ensures no recalculation
                      // Use stable outcomes to prevent recalculation during animation
                      const segmentData = useMemo(() => {
                        // Calculate segment data
                        const calculated = allOutcomes.map((outcome, idx) => {
                          const probValue = outcome.probability ?? 0;
                          const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));

                          // Calculate color inside useMemo
                          const colorHex = outcome?.color
                            ? outcome.color
                            : getOutcomeColor(allOutcomesUnfiltered.findIndex(o => o.id === outcome.id) >= 0
                              ? allOutcomesUnfiltered.findIndex(o => o.id === outcome.id)
                              : 0);

                          const leftPosition = allOutcomes.slice(0, idx).reduce((sum, o) => {
                            const p = Math.min(100, Math.max(0, Math.round((o.probability ?? 0) > 1 ? (o.probability ?? 0) : (o.probability ?? 0) * 100)));
                            return sum + p;
                          }, 0);

                          const segmentDelay = idx * 0.1;
                          const segmentEnd = leftPosition + probability;

                          // Calculate ALL values as fixed strings - never recalculate
                          return {
                            outcome,
                            idx,
                            probability,
                            colorHex,
                            leftPosition,
                            segmentEnd,
                            segmentDelay,
                            segmentLeft: `${leftPosition}%`,
                            segmentWidth: `${probability}%`,
                            clipPathInitial: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)',
                            clipPathFinal: `polygon(0% 0%, ${segmentEnd}% 0%, ${segmentEnd}% 100%, 0% 100%)`,
                            tooltipPosition: leftPosition + (probability / 2)
                          };
                        });

                        // Update the ref for current data but continue to return calculated for live updates
                        segmentDataRef.current = calculated;

                        return calculated;
                      }, [allOutcomes, allOutcomesUnfiltered]);

                      // Shared arrow animation configuration for perfect sync
                      const arrowTransition = {
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut" as const
                      };

                      return (
                        <>
                          <div ref={sliderContainerRef} className="relative w-full">
                            {/* Percentage numbers - hide when hovering */}
                            {(() => {
                              // Check if percentages should be shown
                              const shouldShow = hoveredSegmentId === null;
                              // Skip animation if we've already animated OR if user has ever hovered (to prevent animation on hover-off)
                              const skipAnimation = percentagesShownRef.current || hasEverHoveredRef.current;

                              return segmentData.map(({ outcome, probability, tooltipPosition, segmentDelay, idx }) => {
                                // Show percentage numbers only if not hovering and probability > 15%
                                if (hoveredSegmentId !== null || probability <= 15) return null;

                                return (
                                  <motion.div
                                    key={`tooltip-${outcome.id}`}
                                    initial={{ opacity: 0 }}
                                    animate={{
                                      opacity: probability > 0 ? 1 : 0
                                    }}
                                    transition={{
                                      duration: 0.15,
                                      ease: "easeOut"
                                    }}
                                    className="absolute -top-6 -translate-x-1/2 pointer-events-none z-10"
                                    style={{ left: `${tooltipPosition}%` }}
                                  >
                                    <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
                                      <AnimatedPercentage
                                        value={probability}
                                        delay={(index * 0.05) + 0.3 + segmentDelay}
                                        duration={0.8}
                                        skipAnimation={skipAnimation}
                                      />
                                    </span>
                                  </motion.div>
                                );
                              });
                            })()}

                            {/* Centered outcome name and percentage - shows when hovering any segment */}
                            {hoveredSegmentId && (() => {
                              const hoveredSegment = segmentData.find(s => s.outcome.id === hoveredSegmentId);
                              if (!hoveredSegment) return null;

                              // Position above the center of the hovered segment
                              return (
                                <HoveredTextDisplay
                                  ref={hoveredTextRef}
                                  segmentCenter={hoveredSegment.tooltipPosition}
                                  containerRef={sliderContainerRef}
                                >
                                  {hoveredSegment.outcome.name} {hoveredSegment.probability}%
                                </HoveredTextDisplay>
                              );
                            })()}

                            {/* Slider with ALL outcomes */}
                            <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-rose-500/30 group/slider">
                              {/* Hover areas - positioned outside clipPath containers for accurate detection */}
                              {segmentData.map(({ outcome, segmentLeft, segmentWidth, idx }) => {
                                const isHovered = hoveredSegmentId === outcome.id;
                                return (
                                  <div
                                    key={`hover-${outcome.id}`}
                                    className="absolute top-0 cursor-pointer"
                                    style={{
                                      left: segmentLeft,
                                      width: segmentWidth,
                                      height: '100%',
                                      zIndex: isHovered ? 100 : idx + 50,
                                      pointerEvents: 'auto',
                                    }}
                                    onMouseEnter={() => {
                                      isHoveringSliderRef.current = true;
                                      hasEverHoveredRef.current = true;
                                      setHoveredSegmentId(outcome.id);
                                    }}
                                    onMouseLeave={() => {
                                      isHoveringSliderRef.current = false;
                                      setHoveredSegmentId(null);
                                    }}
                                  />
                                );
                              })}

                              {/* Visible segments with clipPath animations */}
                              {segmentData.map(({ outcome, segmentLeft, segmentWidth, colorHex, clipPathInitial, clipPathFinal, segmentDelay, idx, probability }) => {
                                const isHovered = hoveredSegmentId === outcome.id;
                                const isAnyHovered = hoveredSegmentId !== null;
                                const shouldTint = isAnyHovered && !isHovered;
                                const isFirst = idx === 0;
                                const isLast = idx === segmentData.length - 1;
                                const roundedClasses = isFirst && isLast
                                  ? 'rounded-full'
                                  : isFirst
                                    ? 'rounded-l-full'
                                    : isLast
                                      ? 'rounded-r-full'
                                      : '';

                                // Always animate on first render - segmentData is locked after first calculation
                                return (
                                  <motion.div
                                    key={outcome.id}
                                    initial={{ clipPath: clipPathInitial }}
                                    animate={{
                                      clipPath: clipPathFinal
                                    }}
                                    transition={{
                                      duration: 0.4,
                                      delay: (index * 0.03) + 0.1 + segmentDelay,
                                      ease: [0.25, 0.1, 0.25, 1]
                                    }}
                                    className="absolute top-0 left-0 h-full overflow-visible segment-reveal pointer-events-none"
                                    style={{
                                      width: '100%',
                                      willChange: 'clip-path',
                                      zIndex: isHovered ? 60 : idx + 10,
                                      transform: 'translateZ(0)', // Force GPU layer
                                      backfaceVisibility: 'hidden', // Prevent flicker
                                      // Set initial clip-path directly in style - applied immediately, before animation
                                      clipPath: clipPathInitial
                                    }}
                                  >
                                    {/* Visible segment */}
                                    <motion.div
                                      className={`absolute top-0 h-full origin-center ${roundedClasses}`}
                                      style={{
                                        left: segmentLeft,
                                        width: segmentWidth,
                                        position: 'absolute',
                                        top: '0',
                                        height: '100%',
                                        transformOrigin: 'center center',
                                        backfaceVisibility: 'hidden',
                                      }}
                                      animate={{
                                        scaleY: isHovered ? 1.8 : 1,
                                        opacity: shouldTint ? 0.4 : 1,
                                        backgroundColor: isHovered ? colorHex : muteColor(colorHex, 0.4),
                                      }}
                                      transition={{
                                        duration: 0.2,
                                        ease: "easeOut"
                                      }}
                                    />
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="relative min-h-[36px] overflow-visible">
                            {/* Horizontal scrollable carousel */}
                            <div
                              ref={outcomesCarouselRef}
                              className="flex items-center gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1"
                              style={{
                                WebkitOverflowScrolling: 'touch',
                              }}
                              onScroll={(e) => {
                                const target = e.currentTarget;
                                const isAtStart = target.scrollLeft <= 5;
                                const isAtEnd = target.scrollWidth - target.scrollLeft <= target.clientWidth + 5;

                                // Hide arrows immediately when scrolling
                                setShowRightArrow(false);
                                setShowLeftArrow(false);

                                // Clear existing timer
                                if (scrollInactivityTimerRef.current) {
                                  clearTimeout(scrollInactivityTimerRef.current);
                                }

                                // Show arrows after 3 seconds of inactivity
                                scrollInactivityTimerRef.current = setTimeout(() => {
                                  setShowRightArrow(!isAtEnd);
                                  setShowLeftArrow(!isAtStart);
                                }, 3000);
                              }}
                            >
                              {allOutcomes.map((outcome) => {
                                if (!outcome) return null;
                                const probValue = outcome.probability ?? 0;
                                const probability = Math.min(100, Math.max(0, Math.round(probValue > 1 ? probValue : probValue * 100)));
                                const colorHex = getOutcomeColorForIndex(outcome);
                                const textColor = getTextColorFromHex(colorHex);

                                return (
                                  <motion.button
                                    key={outcome.id}
                                    onClick={(e) => handleMultipleTradeClick(e, outcome.id, outcome.name)}
                                    className="group/btn relative flex-shrink-0 rounded-xl flex items-center justify-center px-3 py-2 cursor-pointer transition-all duration-300 overflow-hidden"
                                    style={{
                                      backgroundColor: hexToRgba(colorHex, 0.1),
                                      ...(binaryButtonWidth ? { width: `${binaryButtonWidth}px` } : {}),
                                    }}
                                    whileHover={{ backgroundColor: hexToRgba(colorHex, 0.2) }}
                                    whileTap={{ opacity: 0.9 }}
                                    onMouseEnter={(e) => {
                                      isHoveringSliderRef.current = true;
                                      e.currentTarget.style.backgroundColor = hexToRgba(colorHex, 0.2);
                                      setHoveredSegmentId(outcome.id);
                                    }}
                                    onMouseLeave={(e) => {
                                      isHoveringSliderRef.current = false;
                                      e.currentTarget.style.backgroundColor = hexToRgba(colorHex, 0.1);
                                      setHoveredSegmentId(null);
                                    }}
                                  >
                                    <span
                                      className="relative z-10 text-[12px] font-bold uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300 whitespace-nowrap truncate w-full text-center"
                                      style={{ color: textColor }}
                                    >
                                      {outcome.name}
                                    </span>
                                    <span
                                      className="absolute z-10 text-[13px] font-bold opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 whitespace-nowrap"
                                      style={{ color: textColor }}
                                    >
                                      {probability}%
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>

                            {/* Left scroll indicator arrow - shows when content is hidden on the left */}
                            {showLeftArrow && (
                              <motion.div
                                initial={{ opacity: 0, x: 0, y: '-50%' }}
                                animate={{
                                  opacity: [0.4, 1, 0.4],
                                  x: [0, -4, 0],
                                  y: '-50%'
                                }}
                                transition={arrowTransition}
                                className="absolute left-[-8px] flex items-center justify-center pointer-events-none z-20"
                                style={{
                                  top: 'calc(50% - 2px)', // Slightly up to align with text center
                                }}
                              >
                                <svg
                                  className="w-4 h-4 text-blue-400 drop-shadow-[0_0_4px_rgba(59,130,246,0.5)]"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d="M15 19l-7-7 7-7"
                                  />
                                </svg>
                              </motion.div>
                            )}

                            {/* Right scroll indicator arrow - shows when content is hidden on the right */}
                            {showRightArrow && (
                              <motion.div
                                initial={{ opacity: 0, x: 0, y: '-50%' }}
                                animate={{
                                  opacity: [0.4, 1, 0.4],
                                  x: [0, 4, 0],
                                  y: '-50%'
                                }}
                                transition={arrowTransition}
                                className="absolute right-[-8px] flex items-center justify-center pointer-events-none z-20"
                                style={{
                                  top: 'calc(50% - 2px)', // Slightly up to align with text center
                                }}
                              >
                                <svg
                                  className="w-4 h-4 text-blue-400 drop-shadow-[0_0_4px_rgba(59,130,246,0.5)]"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                              </motion.div>
                            )}
                          </div>
                        </>
                      );
                    })()
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 mt-3">
                  {(() => {
                    const yesVal = liveYesOdds ?? event.yesOdds ?? 0;
                    const noVal = liveNoOdds ?? event.noOdds ?? 0;
                    const yesDisplay = Math.min(100, Math.max(0, Math.round(yesVal > 1 ? yesVal : yesVal * 100)));
                    const noDisplay = Math.min(100, Math.max(0, Math.round(noVal > 1 ? noVal : noVal * 100)));
                    const isYesHovered = hoveredSegmentId === 'YES';
                    const isNoHovered = hoveredSegmentId === 'NO';
                    const isAnyHovered = hoveredSegmentId !== null;

                    return (
                      <div ref={sliderContainerRef} className="relative">
                        {/* Percentage numbers - hide when hovering */}
                        {(() => {
                          // Check if percentages should be shown
                          const shouldShow = hoveredSegmentId === null;
                          // Skip animation if we've already animated OR if user has ever hovered (to prevent animation on hover-off)
                          const skipAnimation = binaryPercentageAnimatedRef.current || hasEverHoveredRef.current;

                          const segments = [
                            { id: 'YES', probability: yesDisplay, position: yesDisplay / 2, show: yesDisplay > 15 },
                            { id: 'NO', probability: noDisplay, position: yesDisplay + (noDisplay / 2), show: noDisplay > 15 }
                          ];

                          return segments.map(seg => {
                            if (!shouldShow || !seg.show) return null;

                            return (
                              <motion.div
                                key={seg.id}
                                initial={binaryPercentageAnimatedRef.current ? { opacity: 1, left: `${seg.position}%` } : { opacity: 0, left: '50%' }}
                                animate={{
                                  opacity: 1,
                                  left: `${seg.position}%`
                                }}
                                transition={{
                                  opacity: { duration: 0.2, ease: "easeOut" },
                                  left: {
                                    duration: binaryPercentageAnimatedRef.current ? 0.2 : 0.8,
                                    delay: binaryPercentageAnimatedRef.current ? 0 : (index * 0.05) + 0.3,
                                    ease: "easeOut"
                                  }
                                }}
                                className="absolute -top-6 -translate-x-1/2 pointer-events-none z-10"
                              >
                                <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
                                  <AnimatedPercentage
                                    value={seg.probability}
                                    delay={(index * 0.05) + 0.3}
                                    duration={0.8}
                                    skipAnimation={skipAnimation}
                                  />
                                </span>
                              </motion.div>
                            );
                          });
                        })()}

                        {/* Centered outcome name and percentage - shows when hovering */}
                        {hoveredSegmentId && (() => {
                          // Calculate the center of the hovered segment
                          const segmentCenter = hoveredSegmentId === 'YES'
                            ? yesDisplay / 2  // Center of YES segment (half of yesDisplay)
                            : yesDisplay + (noDisplay / 2);  // Center of NO segment (yesDisplay + half of noDisplay)

                          return (
                            <HoveredTextDisplay
                              ref={hoveredTextRef}
                              segmentCenter={segmentCenter}
                              containerRef={sliderContainerRef}
                            /* textClassName="text-xs" - using default */
                            >
                              {hoveredSegmentId} {hoveredSegmentId === 'YES' ? yesDisplay : noDisplay}%
                            </HoveredTextDisplay>
                          );
                        })()}

                        {/* Slider */}
                        <div
                          className="relative h-1.5 w-full rounded-full overflow-hidden group/slider"
                          style={{ backgroundColor: muteColor('#f43f5e', 0.4) }}
                        >
                          {/* Hover areas - positioned for accurate detection */}
                          {yesDisplay > 0 && (
                            <div
                              className="absolute top-0 cursor-pointer"
                              style={{
                                left: '0%',
                                width: `${yesDisplay}%`,
                                height: '100%',
                                zIndex: isYesHovered ? 100 : 50,
                                pointerEvents: 'auto',
                              }}
                              onMouseEnter={() => {
                                isHoveringSliderRef.current = true;
                                hasEverHoveredRef.current = true;
                                setHoveredSegmentId('YES');
                              }}
                              onMouseLeave={() => {
                                isHoveringSliderRef.current = false;
                                setHoveredSegmentId(null);
                              }}
                            />
                          )}
                          {noDisplay > 0 && (
                            <div
                              className="absolute top-0 cursor-pointer"
                              style={{
                                left: `${yesDisplay}%`,
                                width: `${noDisplay}%`,
                                height: '100%',
                                zIndex: isNoHovered ? 100 : 60,
                                pointerEvents: 'auto',
                              }}
                              onMouseEnter={() => {
                                isHoveringSliderRef.current = true;
                                hasEverHoveredRef.current = true;
                                setHoveredSegmentId('NO');
                              }}
                              onMouseLeave={() => {
                                isHoveringSliderRef.current = false;
                                setHoveredSegmentId(null);
                              }}
                            />
                          )}

                          {/* YES segment */}
                          {yesDisplay > 0 && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${yesDisplay}%` }}
                              transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                              className="absolute left-0 top-0 h-full overflow-visible pointer-events-none"
                              style={{
                                zIndex: isYesHovered ? 60 : 10,
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                              }}
                            >
                              <motion.div
                                className={`absolute top-0 h-full origin-center ${yesDisplay === 100 ? 'rounded-full' : 'rounded-l-full'}`}
                                style={{
                                  left: '0%',
                                  width: '100%',
                                  position: 'absolute',
                                  top: '0',
                                  height: '100%',
                                  transformOrigin: 'center center',
                                  backfaceVisibility: 'hidden',
                                }}
                                animate={{
                                  scaleY: isYesHovered ? 1.8 : 1,
                                  opacity: isAnyHovered && !isYesHovered ? 0.4 : 1,
                                  backgroundColor: isYesHovered ? '#10b981' : muteColor('#10b981', 0.4),
                                }}
                                transition={{
                                  duration: 0.2,
                                  ease: "easeOut"
                                }}
                              />
                            </motion.div>
                          )}

                          {/* NO segment */}
                          {noDisplay > 0 && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${noDisplay}%` }}
                              transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                              className="absolute top-0 h-full overflow-visible pointer-events-none"
                              style={{
                                left: `${yesDisplay}%`,
                                zIndex: isNoHovered ? 60 : 10,
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                              }}
                            >
                              <motion.div
                                className={`absolute top-0 h-full origin-center ${noDisplay === 100 ? 'rounded-full' : 'rounded-r-full'}`}
                                style={{
                                  left: '0%',
                                  width: '100%',
                                  position: 'absolute',
                                  top: '0',
                                  height: '100%',
                                  transformOrigin: 'center center',
                                  backfaceVisibility: 'hidden',
                                }}
                                animate={{
                                  scaleY: isNoHovered ? 1.8 : 1,
                                  opacity: isAnyHovered && !isNoHovered ? 0.4 : 1,
                                  backgroundColor: isNoHovered ? '#f43f5e' : muteColor('#f43f5e', 0.4),
                                }}
                                transition={{
                                  duration: 0.2,
                                  ease: "easeOut"
                                }}
                              />
                            </motion.div>
                          )}

                          {/* Separator */}
                          {yesDisplay > 0 && yesDisplay < 100 && (
                            <motion.div
                              initial={{ left: '0%', opacity: 0 }}
                              animate={{
                                left: `${yesDisplay}%`,
                                opacity: 1
                              }}
                              transition={{ duration: 0.8, delay: (index * 0.05) + 0.3, ease: "easeOut" }}
                              className="absolute top-0 h-full w-[2px] bg-white/80 z-10 shadow-[0_0_4px_rgba(255,255,255,0.5)] pointer-events-none"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div ref={binaryButtonContainerRef} className="flex gap-2.5 min-h-[36px]">
                    {(() => {
                      const yesVal = liveYesOdds ?? event.yesOdds ?? 0;
                      const noVal = liveNoOdds ?? event.noOdds ?? 0;
                      const yesDisplay = Math.min(100, Math.max(0, Math.round(yesVal > 1 ? yesVal : yesVal * 100)));
                      const noDisplay = Math.min(100, Math.max(0, Math.round(noVal > 1 ? noVal : noVal * 100)));
                      const isYesHovered = hoveredSegmentId === 'YES';
                      const isNoHovered = hoveredSegmentId === 'NO';

                      // Helper function to convert hex to rgba for opacity
                      const hexToRgba = (hex: string, opacity: number) => {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                      };

                      return (
                        <>
                          <motion.button
                            ref={binaryButtonRef}
                            onClick={(e) => handleTradeClick(e, 'YES')}
                            whileHover={{ backgroundColor: hexToRgba('#10b981', 0.2) }}
                            whileTap={{ scale: 1 }}
                            className="group/btn relative flex-1 rounded-xl flex items-center justify-center px-3 py-2 cursor-pointer transition-all duration-300 overflow-hidden"
                            style={{
                              backgroundColor: isYesHovered
                                ? hexToRgba('#10b981', 0.2)
                                : hexToRgba('#10b981', 0.1),
                            }}
                            onMouseEnter={() => {
                              isHoveringSliderRef.current = true;
                              hasEverHoveredRef.current = true;
                              setHoveredSegmentId('YES');
                            }}
                            onMouseLeave={() => {
                              isHoveringSliderRef.current = false;
                              setHoveredSegmentId(null);
                            }}
                          >
                            <span
                              className="relative z-10 text-[12px] font-bold uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300"
                              style={{ color: muteColor('#10b981', 0.4) }}
                            >YES</span>
                            <span
                              className="absolute z-10 text-[13px] font-bold opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 whitespace-nowrap"
                              style={{ color: muteColor('#10b981', 0.4) }}
                            >{yesDisplay}%</span>
                          </motion.button>
                          <motion.button
                            onClick={(e) => handleTradeClick(e, 'NO')}
                            whileHover={{ backgroundColor: hexToRgba('#f43f5e', 0.2) }}
                            whileTap={{ scale: 1 }}
                            className="group/btn relative flex-1 rounded-xl flex items-center justify-center px-3 py-2 cursor-pointer transition-all duration-300 overflow-hidden"
                            style={{
                              backgroundColor: isNoHovered
                                ? hexToRgba('#f43f5e', 0.2)
                                : hexToRgba('#f43f5e', 0.1),
                            }}
                            onMouseEnter={() => {
                              isHoveringSliderRef.current = true;
                              hasEverHoveredRef.current = true;
                              setHoveredSegmentId('NO');
                            }}
                            onMouseLeave={() => {
                              isHoveringSliderRef.current = false;
                              setHoveredSegmentId(null);
                            }}
                          >
                            <span
                              className="relative z-10 text-[12px] font-bold uppercase tracking-wide opacity-100 group-hover/btn:opacity-0 transition-opacity duration-300"
                              style={{ color: muteColor('#f43f5e', 0.4) }}
                            >NO</span>
                            <span
                              className="absolute z-10 text-[13px] font-bold opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"
                              style={{ color: muteColor('#f43f5e', 0.4) }}
                            >{noDisplay}%</span>
                          </motion.button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 3. Stats Row */}
              <div className={`flex items-center justify-between text-white/60 pt-0.5 ${event.type === 'GROUPED_BINARY' ? 'absolute bottom-2 left-4 right-4' : 'mt-auto'}`}>
                <div className="flex items-center justify-between flex-1 pr-1">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    {volume}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    {commentsCount}
                  </span>
                </div>
              </div>
            </motion.div>

          </Link>
        </motion.div>

        {/* Buy Interface - Polymarket style */}
        <motion.div
          className="absolute inset-0 w-full h-full z-10"
          initial={{ opacity: 0, x: 20 }}
          animate={{
            opacity: showBuyInterface ? 1 : 0,
            x: showBuyInterface ? 0 : 20,
            pointerEvents: showBuyInterface ? 'auto' : 'none'
          }}
          transition={{ duration: 0.2 }}
        >
          <div
            style={{ backgroundColor: 'var(--surface)' }}
            className="border border-blue-400/10 hover:border-blue-400/30 rounded-2xl px-4 pt-3 pb-3 h-[220px] w-full flex flex-col gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-200 relative overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCloseBuy();
              }}
              className="absolute top-3 right-4 z-10 w-5 h-5 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header - Compact */}
            <div className="flex items-center gap-2 flex-shrink-0 pr-8">
              {event.imageUrl ? (
                <img
                  src={event.imageUrl}
                  alt={event.title}
                  className="w-8 h-8 rounded-lg object-cover border border-blue-400/20 flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                  {event.categories && event.categories.length > 0
                    ? event.categories[0][0]
                    : event.category
                      ? event.category[0]
                      : '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white leading-tight line-clamp-2">
                  {selectedOutcomeName || event.title}
                </p>
              </div>
            </div>

            {/* Amount Input - Compact */}
            <div className="flex-shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                <input
                  type="text"
                  value={buyAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-6 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors text-sm font-medium"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Preset buttons - Compact */}
            <div className="grid grid-cols-4 gap-1.5 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  incrementAmount(1);
                }}
                className="h-7 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                +1
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  incrementAmount(10);
                }}
                className="h-7 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                +10
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  incrementAmount(100);
                }}
                className="h-7 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                +100
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMaxAmount();
                }}
                className="h-7 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                MAX
              </button>
            </div>

            {/* Balance Slider - Compact, integrated - Always rendered to prevent layout shift */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[balancePct]}
                  className="flex-1 h-1"
                  disabled={userBalance <= 0}
                  onValueChange={(value: number[]) => {
                    const pct = Math.max(0, Math.min(100, value?.[0] ?? 0));
                    setBalancePct(pct);
                    const balance = Number(userBalance) || 0;
                    if (balance > 0) {
                      const nextAmount = balance * (pct / 100);
                      setBuyAmount(nextAmount > 0 ? nextAmount.toFixed(2) : '');
                    }
                  }}
                />
                <span className="w-8 text-right text-[10px] text-gray-400 whitespace-nowrap">
                  {balancePct.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Buy Button - Takes remaining space */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleBuy();
              }}
              disabled={isLoading || amountNum <= 0}
              className="flex-1 min-h-[48px] disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5"
              style={{
                backgroundColor: buyButtonColor,
              }}
              onMouseEnter={(e) => {
                if (!isLoading && amountNum > 0) {
                  e.currentTarget.style.backgroundColor = darkenColor(buyButtonColor, 0.1);
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading && amountNum > 0) {
                  e.currentTarget.style.backgroundColor = buyButtonColor;
                }
              }}
            >
              <span className="text-sm font-bold">Buy {selectedOption}</span>
              <span className="text-[11px] font-normal text-white/90">
                To win ${winAmount.toFixed(2)}
              </span>
            </button>
          </div>
        </motion.div>
      </motion.div >
    </div >
  );
}
