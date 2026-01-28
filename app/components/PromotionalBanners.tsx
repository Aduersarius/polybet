'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { SignupModal } from './auth/SignupModal';
import { LoginModal } from './auth/LoginModal';
import { CreateEventModal } from './admin/CreateEventModal';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

interface DbEvent {
    id: string;
    title: string;
    volume?: number;
    slug?: string;
    imageUrl?: string | null;
}

export function PromotionalBanners() {
    const { data: session } = useSession();
    const router = useRouter();
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSuggestModal, setShowSuggestModal] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    // Fetch top 3 events by volume (real events from the platform)
    const { data: topEvents } = useQuery<DbEvent[]>({
        queryKey: ['top-events-banners'],
        queryFn: async () => {
            try {
                const res = await fetch('/api/events?sortBy=volume_high&limit=3');
                if (!res.ok) {
                    console.error('Failed to fetch events:', res.status);
                    return [];
                }
                const json = await res.json();
                // API returns { data: [...] } format
                const events = Array.isArray(json) ? json : (json.data || []);
                console.log('Fetched events for banners:', events.length);
                return events;
            } catch (e) {
                console.error('Failed to fetch events for banners:', e);
                return [];
            }
        },
        staleTime: 60_000,
        gcTime: 5 * 60 * 1000,
        retry: 2,
    });

    const handleDemoBalance = () => {
        if (session?.user) {
            router.push('/');
        } else {
            setShowSignupModal(true);
        }
    };

    const handleReferral = () => {
        router.push('/affiliate/signup');
    };

    const handleSuggestEvent = () => {
        if (session?.user) {
            setShowSuggestModal(true);
        } else {
            setShowSignupModal(true);
        }
    };

    const handleEventClick = (event: DbEvent) => {
        if (event?.id) {
            const path = event.slug ? `/event/${event.slug}` : `/event/${event.id}`;
            router.push(path);
        }
    };

    // Create event banners from top events (only if we have real events)
    const eventBanners = (topEvents || []).map((event, index) => ({
        id: `event-${event.id}`,
        type: 'event' as const,
        title: event.title,
        subtitle: `#${index + 1} Trending • ${event.volume ? `$${(event.volume / 1000).toFixed(0)}K Volume` : 'Hot Market'}`,
        buttonText: 'Trade Now',
        onClick: () => handleEventClick(event),
        imageUrl: event.imageUrl,
        event: event,
    }));

    // Main slider banners (rotate through these)
    const mainBanners = [
        // Top events first
        ...eventBanners,
        // Then promotional banners
        {
            id: 'demo',
            type: 'promo' as const,
            title: 'Start with $10,000',
            subtitle: 'Practice trading with demo funds - zero risk, full experience',
            buttonText: 'Get Started',
            onClick: handleDemoBalance,
            imageUrl: null,
        },
        {
            id: 'suggest',
            type: 'promo' as const,
            title: 'Create Your Market',
            subtitle: 'Propose an event and let the community trade on it',
            buttonText: 'Suggest Event',
            onClick: handleSuggestEvent,
            imageUrl: null,
        },
    ];

    const validMainBanners = mainBanners;

    const nextSlide = () => {
        setCurrentSlide((prev) => (prev + 1) % validMainBanners.length);
    };

    const prevSlide = () => {
        setCurrentSlide((prev) => (prev - 1 + validMainBanners.length) % validMainBanners.length);
    };

    const currentBanner = validMainBanners[currentSlide];

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="mb-8"
            >
                {/* Mobile Layout: Main banner on top, two mini banners side by side below */}
                {/* Desktop Layout: Main banner 2/3 + mini banners stacked 1/3 */}
                <div className="flex flex-col lg:grid lg:grid-cols-3 gap-3 lg:gap-4">
                    
                    {/* Large Main Banner (full width on mobile, 2/3 on desktop) */}
                    <div className="lg:col-span-2 relative group order-1">
                        <div className="relative h-44 sm:h-56 lg:h-64 rounded-2xl overflow-hidden">
                            {/* Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#1a2744] to-[#0d1a2d]">
                                {/* Animated glow effects */}
                                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
                                <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
                                <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-cyan-400/20 rounded-full blur-2xl" />
                            </div>

                            {/* Event Image - Netflix-style full bleed with smooth fade */}
                            {currentBanner?.type === 'event' && currentBanner?.imageUrl && (
                                <>
                                    {/* Full background image */}
                                    <div className="absolute inset-0">
                                        <Image
                                            src={currentBanner.imageUrl}
                                            alt={currentBanner.title}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                            priority
                                        />
                                    </div>
                                    
                                    {/* Smooth gradient overlays for text readability */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a1628] via-[#0a1628]/80 via-40% to-transparent" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/90 via-transparent to-[#0a1628]/40" />
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628]/60 to-transparent" />
                                    
                                    {/* Live indicator badge */}
                                    <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/30 backdrop-blur-md rounded-full px-3 py-1.5 z-20">
                                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                        <span className="text-white text-xs font-semibold">LIVE</span>
                                    </div>
                                </>
                            )}
                            
                            {/* Fallback graphic for events without images */}
                            {currentBanner?.type === 'event' && !currentBanner?.imageUrl && (
                                <div className="absolute right-0 top-0 bottom-0 w-1/2 sm:w-2/5 flex items-center justify-center">
                                    <div className="relative w-32 h-32 sm:w-44 sm:h-44 lg:w-56 lg:h-56">
                                        {/* Outer glow */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" />
                                        
                                        {/* Main floating card */}
                                        <div className="absolute inset-4 sm:inset-6">
                                            <div 
                                                className="absolute inset-0 bg-gradient-to-br from-[#1e3a5f] to-[#0f2744] rounded-2xl shadow-2xl border border-blue-400/20 overflow-hidden"
                                                style={{ transform: 'rotateY(-8deg) rotateX(5deg)' }}
                                            >
                                                {/* Chart visualization */}
                                                <div className="absolute inset-2 sm:inset-3">
                                                    <svg className="w-full h-full opacity-70" viewBox="0 0 100 60" preserveAspectRatio="none">
                                                        <defs>
                                                            <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.6"/>
                                                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
                                                            </linearGradient>
                                                        </defs>
                                                        <path 
                                                            d="M 0 45 Q 15 40, 25 35 T 45 28 T 65 20 T 85 25 T 100 15" 
                                                            fill="none" 
                                                            stroke="#3B82F6" 
                                                            strokeWidth="2.5"
                                                        />
                                                        <path 
                                                            d="M 0 45 Q 15 40, 25 35 T 45 28 T 65 20 T 85 25 T 100 15 L 100 60 L 0 60 Z" 
                                                            fill="url(#trendGradient)"
                                                        />
                                                    </svg>
                                                    {/* Trend indicator */}
                                                    <div className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-green-500/20 backdrop-blur-sm rounded-full px-1.5 py-0.5 sm:px-2 sm:py-1 flex items-center gap-1">
                                                        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-green-400" />
                                                        <span className="text-green-400 text-[8px] sm:text-[10px] font-bold">LIVE</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Floating YES chip */}
                                        <div 
                                            className="absolute -right-1 sm:-right-2 top-1/4 px-2 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg text-white text-[10px] sm:text-xs font-bold animate-bounce"
                                            style={{ animationDuration: '2s', animationDelay: '0.2s' }}
                                        >
                                            YES
                                        </div>
                                        
                                        {/* Floating NO chip */}
                                        <div 
                                            className="absolute -left-1 sm:-left-2 bottom-1/3 px-2 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-lg shadow-lg text-white text-[10px] sm:text-xs font-bold animate-bounce"
                                            style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}
                                        >
                                            NO
                                        </div>

                                        {/* Floating coins */}
                                        <div 
                                            className="absolute -left-2 sm:-left-4 top-1/4 w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full shadow-lg flex items-center justify-center animate-bounce"
                                            style={{ animationDuration: '3s' }}
                                        >
                                            <span className="text-yellow-900 font-bold text-[10px] sm:text-xs">$</span>
                                        </div>
                                        
                                        <div 
                                            className="absolute right-0 sm:right-2 bottom-1/4 w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full shadow-lg flex items-center justify-center animate-bounce"
                                            style={{ animationDuration: '2.8s', animationDelay: '0.3s' }}
                                        >
                                            <span className="text-yellow-900 font-bold text-[8px] sm:text-[10px]">$</span>
                                        </div>

                                        {/* Sparkle effects */}
                                        <div className="absolute top-2 right-6 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full animate-ping opacity-75" />
                                        <div className="absolute bottom-4 left-4 w-1 h-1 sm:w-1.5 sm:h-1.5 bg-purple-400 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.5s' }} />
                                    </div>
                                </div>
                            )}

                            {/* Atmospheric style for Create Your Market */}
                            {currentBanner?.type === 'promo' && currentBanner?.id === 'suggest' && (
                                <>
                                    {/* Atmospheric glow orbs */}
                                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/25 rounded-full blur-3xl animate-pulse" />
                                    <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-violet-500/20 rounded-full blur-3xl" />
                                    <div className="absolute top-1/3 right-1/3 w-32 h-32 bg-fuchsia-400/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
                                    
                                    {/* Decorative lightbulb/idea icon */}
                                    <div className="absolute right-6 sm:right-12 lg:right-20 top-1/2 -translate-y-1/2 opacity-15">
                                        <svg className="w-32 h-32 sm:w-44 sm:h-44 lg:w-56 lg:h-56 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </div>
                                </>
                            )}

                            {/* Atmospheric style for Demo Balance */}
                            {currentBanner?.type === 'promo' && currentBanner?.id === 'demo' && (
                                <>
                                    {/* Atmospheric glow orbs */}
                                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/25 rounded-full blur-3xl animate-pulse" />
                                    <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl" />
                                    <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-teal-400/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
                                    
                                    {/* Decorative rocket icon - launch your journey */}
                                    <div className="absolute right-6 sm:right-12 lg:right-20 top-1/2 -translate-y-1/2 opacity-15">
                                        <svg className="w-32 h-32 sm:w-44 sm:h-44 lg:w-56 lg:h-56 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                            <path d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </div>
                                </>
                            )}

                            {/* Text Background Gradient - for better readability on mobile (only for non-event banners) */}
                            {currentBanner?.type !== 'event' && (
                                <div className="absolute inset-0 bg-gradient-to-r from-[#0a1628] via-[#0a1628]/90 to-transparent w-3/4 sm:w-2/3 lg:w-1/2 z-[5]" />
                            )}

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-4 sm:p-6 lg:p-10">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={currentBanner?.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ duration: 0.3 }}
                                        className="max-w-[65%] sm:max-w-[60%] lg:max-w-lg"
                                    >
                                        <h2 className="text-xl sm:text-2xl lg:text-4xl font-bold text-white mb-2 sm:mb-3 leading-tight">
                                            {currentBanner?.title}
                                        </h2>
                                        <p className="text-xs sm:text-sm lg:text-base text-blue-100/80 mb-4 sm:mb-6 line-clamp-2">
                                            {currentBanner?.subtitle}
                                        </p>
                                        <button
                                            onClick={currentBanner?.onClick}
                                            className="px-4 py-2 sm:px-6 sm:py-3 bg-white text-[#0a1628] font-bold rounded-lg sm:rounded-xl hover:bg-blue-50 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-xs sm:text-sm lg:text-base"
                                        >
                                            {currentBanner?.buttonText}
                                        </button>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Navigation Arrows */}
                            {validMainBanners.length > 1 && (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            prevSlide();
                                        }}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center z-20"
                                        aria-label="Previous slide"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            nextSlide();
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center z-20"
                                        aria-label="Next slide"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </>
                            )}

                            {/* Slide Indicators */}
                            {validMainBanners.length > 1 && (
                                <div className="absolute bottom-4 left-6 lg:left-10 flex gap-2 z-10">
                                    {validMainBanners.map((_, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setCurrentSlide(index)}
                                            className={`h-1.5 rounded-full transition-all duration-300 ${
                                                currentSlide === index 
                                                    ? 'bg-white w-8' 
                                                    : 'bg-white/40 w-4 hover:bg-white/60'
                                            }`}
                                            aria-label={`Go to slide ${index + 1}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mini Banners: Side by side on mobile, stacked on desktop */}
                    <div className="flex flex-row lg:flex-col gap-3 lg:gap-4 order-2">
                        
                        {/* Mini Banner 1: Discord - Atmospheric style */}
                        <div 
                            onClick={() => window.open('https://discord.gg/zdm8sVgg', '_blank', 'noopener,noreferrer')}
                            className="relative flex-1 h-32 sm:h-40 lg:h-[calc(50%-0.5rem)] rounded-2xl overflow-hidden cursor-pointer group"
                        >
                            {/* Atmospheric Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#5865F2]/20 via-[#0d1a2d] to-[#0a1628]">
                                {/* Animated glow orbs */}
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#5865F2]/40 rounded-full blur-3xl animate-pulse" />
                                <div className="absolute bottom-0 left-1/4 w-24 h-24 bg-[#5865F2]/20 rounded-full blur-2xl" />
                                <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-indigo-400/30 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
                            </div>

                            {/* Decorative Discord icon */}
                            <div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-30 transition-opacity">
                                <svg className="w-20 h-20 sm:w-28 sm:h-28 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                                </svg>
                            </div>

                            {/* Gradient overlay for text */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1a2d] via-[#0d1a2d]/70 to-transparent" />

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-4 sm:p-5">
                                <span className="text-[10px] sm:text-xs font-semibold text-[#5865F2] uppercase tracking-wider mb-1">Community</span>
                                <h3 className="text-base sm:text-xl font-bold text-white mb-1">Join Discord</h3>
                                <p className="text-[10px] sm:text-xs text-white/60">Connect with traders</p>
                            </div>

                            {/* Hover effect */}
                            <div className="absolute inset-0 bg-[#5865F2]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[15]" />
                            
                            {/* Arrow indicator */}
                            <div className="absolute right-4 bottom-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1 z-20">
                                <ChevronRight className="w-4 h-4 text-white" />
                            </div>
                        </div>

                        {/* Mini Banner 2: Referral - Atmospheric style */}
                        <div 
                            onClick={handleReferral}
                            className="relative flex-1 h-32 sm:h-40 lg:h-[calc(50%-0.5rem)] rounded-2xl overflow-hidden cursor-pointer group"
                        >
                            {/* Atmospheric Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 via-[#0d1a2d] to-[#0a1628]">
                                {/* Animated glow orbs */}
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/30 rounded-full blur-3xl animate-pulse" />
                                <div className="absolute bottom-0 left-1/3 w-20 h-20 bg-green-400/20 rounded-full blur-2xl" />
                                <div className="absolute top-1/3 right-1/3 w-12 h-12 bg-teal-400/25 rounded-full blur-xl animate-pulse" style={{ animationDelay: '0.5s' }} />
                            </div>

                            {/* Decorative gift/money icon */}
                            <div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-30 transition-opacity">
                                <svg className="w-20 h-20 sm:w-28 sm:h-28 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>

                            {/* Gradient overlay for text */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1a2d] via-[#0d1a2d]/70 to-transparent" />

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-4 sm:p-5">
                                <span className="text-[10px] sm:text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Earn Rewards</span>
                                <h3 className="text-base sm:text-xl font-bold text-white mb-1">Refer Friends</h3>
                                <p className="text-[10px] sm:text-xs text-white/60">Get % from their trades</p>
                            </div>

                            {/* Hover effect */}
                            <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[15]" />
                            
                            {/* Arrow indicator */}
                            <div className="absolute right-4 bottom-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1 z-20">
                                <ChevronRight className="w-4 h-4 text-white" />
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Modals */}
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
            <CreateEventModal
                isOpen={showSuggestModal}
                onClose={() => setShowSuggestModal(false)}
                mode="user"
            />
        </>
    );
}
