'use client';

import { motion } from "framer-motion";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { TradingPanelModal } from "./TradingPanelModal";
import { MultipleTradingPanelModal } from "./MultipleTradingPanelModal";
import { EventCard2 } from "./EventCard";
import { MobileCTABanner } from "./MobileCTABanner";
import { SignupModal } from "./auth/SignupModal";
import { LoginModal } from "./auth/LoginModal";
import { Skeleton } from "@/components/ui/skeleton";
import type { DbEvent } from "@/lib/data";

const EVENTS_PER_PAGE = 20;

// Cookie utilities
function setCookie(name: string, value: string, days: number) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax;Secure`;
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

interface EventFeedClientProps {
    initialEvents: DbEvent[];
    initialCategory?: string;
}

export function EventFeedClient({ initialEvents, initialCategory = 'ALL' }: EventFeedClientProps) {
    const [selectedCategory, setSelectedCategory] = useState(initialCategory);
    const [timeHorizon, setTimeHorizon] = useState<'all' | '1d' | '1w' | '1m'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'volume_high' | 'volume_low' | 'liquidity_high' | 'ending_soon'>('volume_high');
    const [searchQuery, setSearchQuery] = useState('');

    const [tradingModalOpen, setTradingModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<DbEvent | null>(null);
    const [preselectedOption, setPreselectedOption] = useState<'YES' | 'NO'>('YES');

    const [multipleTradingModalOpen, setMultipleTradingModalOpen] = useState(false);
    const [selectedMultipleEvent, setSelectedMultipleEvent] = useState<DbEvent | null>(null);

    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);

    const [showFooter, setShowFooter] = useState(false);
    const fourthRowRef = useRef<HTMLDivElement>(null);

    const router = useRouter();

    const handleCategoryChange = (category: string) => {
        router.push(`?category=${category}`);
        setSelectedCategory(category);
    };

    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch additional pages (not first page - that's SSR)
    const {
        data: eventsPages,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isLoadingEvents,
    } = useInfiniteQuery({
        queryKey: ['events-feed', selectedCategory, timeHorizon, sortBy, debouncedSearchQuery],
        queryFn: async ({ pageParam = 0 }) => {
            // Skip first page if pageParam is 0 and we have initialEvents
            if (pageParam === 0 && initialEvents.length > 0) {
                return {
                    events: initialEvents,
                    nextOffset: EVENTS_PER_PAGE,
                    hasMore: initialEvents.length === EVENTS_PER_PAGE,
                };
            }

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

    // Flatten all pages
    const eventsData = useMemo(() => {
        if (!eventsPages) return initialEvents;
        const all = eventsPages.pages.flatMap(page => page.events);
        const seen = new Set<string>();
        return all.filter(event => {
            if (seen.has(event.id)) return false;
            seen.add(event.id);
            return true;
        });
    }, [eventsPages, initialEvents]);

    // Fetch favorites
    const { data: favoriteEvents } = useQuery<DbEvent[]>({
        queryKey: ['favorite-events'],
        queryFn: async () => {
            const res = await fetch('/api/user/favorites');
            if (!res.ok) {
                if (res.status === 401) return [];
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

    // Global search listener
    useEffect(() => {
        const handleGlobalSearch = (e: CustomEvent) => {
            setSearchQuery(e.detail.query);
        };
        window.addEventListener('globalSearch', handleGlobalSearch as EventListener);
        return () => window.removeEventListener('globalSearch', handleGlobalSearch as EventListener);
    }, []);

    // Save category to cookies
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                setCookie('selectedCategory', selectedCategory, 30);
            } catch (e) {
                console.log('Cookies not available:', e);
            }
        }
    }, [selectedCategory]);

    // Restore category and scroll
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const category = urlParams.get('category');
            if (category) {
                setSelectedCategory(category);
            } else {
                let saved = null;
                try {
                    saved = getCookie('selectedCategory');
                } catch (e) {
                    console.log('Cookies not available:', e);
                }
                if (saved) {
                    setSelectedCategory(saved);
                }
            }
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

        if (selectedCategory === 'FAVORITES') {
            filtered = (favoriteEvents || []).slice();
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((e: DbEvent) =>
                e.title.toLowerCase().includes(query) ||
                ((e as any).categories && (e as any).categories.some((cat: string) => cat.toLowerCase().includes(query)))
            );
        }

        const effectiveSort =
            selectedCategory === 'TRENDING' ? 'volume_high' :
                selectedCategory === 'NEW' ? 'newest' : sortBy;

        filtered.sort((a: DbEvent, b: DbEvent) => {
            if (effectiveSort === 'volume_high') return (b.volume || 0) - (a.volume || 0);
            if (effectiveSort === 'volume_low') return (a.volume || 0) - (b.volume || 0);
            if (effectiveSort === 'liquidity_high') return (b.betCount || 0) - (a.betCount || 0);
            if (effectiveSort === 'ending_soon') return new Date(a.resolutionDate).getTime() - new Date(b.resolutionDate).getTime();
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return {
            activeEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) > now),
            endedEvents: filtered.filter((e: DbEvent) => new Date(e.resolutionDate) <= now)
        };
    }, [selectedCategory, searchQuery, eventsData, favoriteEvents, sortBy]);

    // Footer visibility observer
    useEffect(() => {
        const fourthRowElement = fourthRowRef.current;
        if (!fourthRowElement) return;

        const observer = new IntersectionObserver(
            (entries) => {
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

    // Infinite scroll
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

    return (
        <>
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
                {activeEvents.length > 0 && activeEvents.length < 16 && (
                    <div ref={fourthRowRef} className="hidden" />
                )}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={loadMoreRef} className={`w-full flex justify-center ${isFetchingNextPage || (isLoadingEvents && activeEvents.length === 0) ? 'py-12' : 'py-1'}`}>
                {isFetchingNextPage && (
                    <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-8">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={`loading-more-${i}`} className="bg-[#1a1d28] rounded-2xl border border-white/5 p-4 space-y-4 h-[220px] flex flex-col">
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
                            <div key={i} className="bg-[#1a1d28] rounded-2xl border border-white/5 p-4 space-y-4 h-[220px] flex flex-col">
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

            {/* Trading Modals */}
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
                        price: outcome.probability,
                        odds: 1 / outcome.probability,
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

            {/* Mobile CTA */}
            <MobileCTABanner onSignupClick={() => setShowSignupModal(true)} />
        </>
    );
}
