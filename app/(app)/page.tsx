'use client';
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { TradingPanelModal } from "../components/TradingPanelModal";
import { MultipleTradingPanelModal } from "../components/MultipleTradingPanelModal";
import { EventCard2 } from "../components/EventCard2";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, ChartConfig } from "@/components/ui/chart";
import { MobileCTABanner } from "../components/MobileCTABanner";
import { SignupModal } from "../components/auth/SignupModal";
import { LoginModal } from "../components/auth/LoginModal";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";

const EVENTS_PER_PAGE = 20;

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
  categories?: string[];
  resolutionDate: string;
  createdAt: string;
  imageUrl?: string | null;
  volume?: number;
  betCount?: number;
  yesOdds?: number;
  noOdds?: number;
  type?: string;
  source?: string;
  polymarketId?: string;
  externalVolume?: number;
  externalBetCount?: number;
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
  const [sortBy, setSortBy] = useState<'newest' | 'volume_high' | 'volume_low' | 'liquidity_high' | 'ending_soon'>('volume_high');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Trading panel modal state
  const [tradingModalOpen, setTradingModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DbEvent | null>(null);
  const [preselectedOption, setPreselectedOption] = useState<'YES' | 'NO'>('YES');

  // Multiple trading panel modal state
  const [multipleTradingModalOpen, setMultipleTradingModalOpen] = useState(false);
  const [selectedMultipleEvent, setSelectedMultipleEvent] = useState<DbEvent | null>(null);

  // Auth modal state
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Footer visibility - show after 4th row becomes visible
  const [showFooter, setShowFooter] = useState(false);
  const fourthRowRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  const handleCategoryChange = (category: string) => {
    router.push(`?category=${category}`);
    setSelectedCategory(category);
  };

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch events from DB with infinite scroll (20 events per page)
  const {
    data: eventsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingEvents,
  } = useInfiniteQuery({
    queryKey: ['events-feed', selectedCategory, timeHorizon, sortBy, debouncedSearchQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        category: selectedCategory === 'ALL' ? '' : selectedCategory,
        timeHorizon,
        sortBy,
        search: debouncedSearchQuery,
        limit: String(EVENTS_PER_PAGE),
        offset: String(pageParam),
      });
      const res = await fetch(`/api/events?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const json = await res.json();
      const data = Array.isArray(json) ? json : json.data;
      const pagination = json.pagination || { hasMore: false, total: 0 };
      const normalized = (data || []).map((evt: any) => ({
        ...evt,
        category: evt.category || (evt.categories?.[0] ?? 'General'),
      }));
      return {
        events: normalized as DbEvent[],
        nextOffset: pageParam + EVENTS_PER_PAGE,
        hasMore: pagination.hasMore,
      };
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });

  // Flatten all pages into a single array and dedupe by ID
  const eventsData = useMemo(() => {
    if (!eventsPages) return [];
    const all = eventsPages.pages.flatMap(page => page.events);
    // Dedupe by event ID (pagination can cause overlaps due to DB vs JS filtering)
    const seen = new Set<string>();
    return all.filter(event => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }, [eventsPages]);

  // Fetch user's favorite events
  const { data: favoriteEvents } = useQuery<DbEvent[]>({
    queryKey: ['favorite-events'],
    queryFn: async () => {
      const res = await fetch('/api/user/favorites');
      if (!res.ok) {
        if (res.status === 401) return []; // User not logged in
        throw new Error('Failed to fetch favorites');
      }
      const json = await res.json();
      const data = json.data || [];
      return data.map((evt: any) => ({
        ...evt,
        category: evt.category || (evt.categories?.[0] ?? 'General'),
      })) as DbEvent[];
    },
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
  });


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


  const { activeEvents, endedEvents } = useMemo(() => {
    const now = new Date();
    let filtered = (eventsData || []).slice();

    // Favorites are already fetched from a separate hook, but if they are in eventsData, we dedupe
    if (selectedCategory === 'FAVORITES') {
      filtered = (favoriteEvents || []).slice();
    }

    // Apply search filter locally for instant feedback
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e: DbEvent) =>
        e.title.toLowerCase().includes(query) ||
        ((e as any).categories && (e as any).categories.some((cat: string) => cat.toLowerCase().includes(query)))
      );
    }

    // Sorting is handled by the API but we keep this for local consistency
    const effectiveSort =
      selectedCategory === 'TRENDING' ? 'volume_high' :
        selectedCategory === 'NEW' ? 'newest' : sortBy;

    filtered.sort((a: DbEvent, b: DbEvent) => {
      if (effectiveSort === 'volume_high') return (b.volume || 0) - (a.volume || 0);
      if (effectiveSort === 'volume_low') return (a.volume || 0) - (b.volume || 0);
      if (effectiveSort === 'liquidity_high') return (b.betCount || 0) - (a.betCount || 0);
      if (effectiveSort === 'ending_soon') return new Date(a.resolutionDate).getTime() - new Date(b.resolutionDate).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
    });

    return {
      activeEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) > now),
      endedEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) <= now)
    };
  }, [selectedCategory, searchQuery, eventsData, favoriteEvents, sortBy]);

  // Show footer after 4th row is visible (using IntersectionObserver)
  useEffect(() => {
    const fourthRowElement = fourthRowRef.current;
    if (!fourthRowElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Show footer when the 4th row element has been scrolled past (not intersecting)
        // or is intersecting (meaning we've reached it)
        const entry = entries[0];
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
          setShowFooter(true);
        }
      },
      { threshold: 0, rootMargin: '100px' }
    );

    observer.observe(fourthRowElement);
    return () => observer.disconnect();
  }, [activeEvents.length]);

  // #region agent log
  // useEffect(() => {
  //   const now = new Date();
  //   fetch('http://127.0.0.1:7242/ingest/069f0f82-8b75-45af-86d9-78499faddb6a', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       sessionId: 'debug-session',
  //       runId: 'pre-fix',
  //       hypothesisId: 'H-client-filter',
  //       location: 'app/(app)/page.tsx:useMemo',
  //       message: 'client filter result',
  //       data: {
  //         selectedCategory,
  //         timeHorizon,
  //         sortBy,
  //         searchQuery,
  //         eventsDataCount: eventsData?.length ?? 0,
  //         activeCount: activeEvents.length,
  //         endedCount: endedEvents.length,
  //         nowIso: now.toISOString(),
  //       },
  //       timestamp: Date.now(),
  //     }),
  //   }).catch(() => { });
  // }, [selectedCategory, timeHorizon, sortBy, searchQuery, eventsData, activeEvents.length, endedEvents.length]);
  // #endregion

  // Infinite scroll: intersection observer
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  return (
    <main className="flex flex-col relative overflow-x-hidden max-w-full">

      <div className="flex-grow overflow-x-hidden max-w-full">
        <motion.div
          key="markets"
          className="min-h-screen relative text-white z-10 overflow-x-hidden max-w-full"
          style={{ overflowY: 'visible' }}
        >
          <Navbar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

          {/* Markets Content - Added pt-32 to account for fixed navbar height */}
          <div className="relative z-10 pt-32 px-6 max-w-7xl mx-auto pb-8">

            {/* Sort Options */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative mb-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent flex items-center gap-4 flex-1 tracking-tight uppercase" style={{ letterSpacing: '0.03em' }}>
                    {selectedCategory === 'FAVORITES' ? 'My Favorites' :
                      selectedCategory === 'ALL' ? 'All Markets' :
                        selectedCategory === 'NEW' ? 'New Markets' :
                          selectedCategory === 'TRENDING' ? 'Trending Markets' :
                            `${selectedCategory} Markets`}
                    <div className="h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent flex-1 hidden sm:block" />
                  </h2>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full sm:w-auto">
                  {/* Time Horizon Filter */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { key: 'all', label: 'All' },
                      { key: '1d', label: '1D' },
                      { key: '1w', label: '1W' },
                      { key: '1m', label: '1M' }
                    ].map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setTimeHorizon(option.key as typeof timeHorizon)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors uppercase ${timeHorizon === option.key
                          ? 'bg-blue-500 text-white'
                          : 'text-gray-400 hover:text-white'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {/* Sort Controls */}
                  <div className="flex items-center gap-1.5">
                    {[
                      { key: 'newest', label: 'Newest' },
                      { key: 'volume_high', label: 'Vol ↑' },
                      { key: 'volume_low', label: 'Vol ↓' },
                      { key: 'liquidity_high', label: 'Liq ↑' },
                      { key: 'ending_soon', label: 'Ending' }
                    ].map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setSortBy(option.key as typeof sortBy)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors uppercase ${sortBy === option.key
                          ? 'bg-blue-500 text-white'
                          : 'text-gray-400 hover:text-white'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 mb-4" style={{ overflow: 'visible', overflowY: 'visible', paddingTop: '20px', marginTop: '-20px' }}>
              {activeEvents.map((event, idx) => (
                <div
                  key={event.id}
                  ref={idx === 15 ? fourthRowRef : undefined}
                  style={{ overflow: 'visible', paddingTop: '20px', marginTop: '-20px' }}
                >
                  <EventCard2
                    event={event}
                    index={idx}
                    onCategoryClick={handleCategoryChange}
                  />
                </div>
              ))}
              {/* Fallback sentinel if we have fewer than 16 events */}
              {activeEvents.length > 0 && activeEvents.length < 16 && (
                <div ref={fourthRowRef} className="hidden" />
              )}
            </div>

            {/* Infinite scroll sentinel and loading indicator */}
            <div ref={loadMoreRef} className={`w-full flex justify-center ${isFetchingNextPage || (isLoadingEvents && activeEvents.length === 0) ? 'py-12' : 'py-1'}`}>
              {isFetchingNextPage && (
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-8">
                  {Array.from({ length: 5 }).map((_, i) => ( // Show 5 skeletons to fill a row
                    <div key={`loading-more-${i}`} className="bg-[#1a1d28] rounded-2xl border border-white/5 p-4 space-y-4 h-[260px] flex flex-col">
                      <div className="flex justify-between items-start">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-lg" />
                      </div>
                      <Skeleton className="h-6 w-3/4 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full rounded" />
                        <Skeleton className="h-4 w-5/6 rounded" />
                      </div>
                      <div className="flex gap-2 mt-auto">
                        <Skeleton className="h-10 flex-1 rounded-xl" />
                        <Skeleton className="h-10 flex-1 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isLoadingEvents && activeEvents.length === 0 && (
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="bg-[#1a1d28] rounded-2xl border border-white/5 p-4 space-y-4 h-[260px] flex flex-col">
                      <div className="flex justify-between items-start">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-lg" />
                      </div>
                      <Skeleton className="h-6 w-3/4 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full rounded" />
                        <Skeleton className="h-4 w-5/6 rounded" />
                      </div>
                      <div className="flex gap-2 mt-auto">
                        <Skeleton className="h-10 flex-1 rounded-xl" />
                        <Skeleton className="h-10 flex-1 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div >
        </motion.div >
      </div>

      {/* Footer appears after 4th row (16th card) becomes visible */}
      {showFooter && <Footer />}

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

      {/* Auth Modals */}
      <SignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        onSwitchToLogin={() => {
          setShowSignupModal(false);
          setShowLoginModal(true);
        }}
      />
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSwitchToSignup={() => {
          setShowLoginModal(false);
          setShowSignupModal(true);
        }}
      />

      {/* Mobile CTA Banner */}
      <MobileCTABanner onSignupClick={() => setShowSignupModal(true)} />
    </main>
  );
}
