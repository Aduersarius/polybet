'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { SignupModal } from './auth/SignupModal';
import { LoginModal } from './auth/LoginModal';
import { CreateEventModal } from './admin/CreateEventModal';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { SwitchToDemoDialog } from './SwitchToDemoDialog';

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
    const queryClient = useQueryClient();
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSuggestModal, setShowSuggestModal] = useState(false);
    const [showDemoDialog, setShowDemoDialog] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    // Fetch featured event by ID
    const FEATURED_EVENT_ID = '415643617';

    const { data: topEvent } = useQuery<DbEvent>({
        queryKey: ['featured-event', FEATURED_EVENT_ID],
        queryFn: async () => {
            const res = await fetch(`/api/events/${FEATURED_EVENT_ID}`);
            if (!res.ok) return null;
            const data = await res.json();
            // Don't use event image - we'll use CSS graphic instead
            return { ...data, imageUrl: null };
        },
        staleTime: 60_000,
        gcTime: 5 * 60 * 1000,
    });

    const handleDemoBalance = () => {
        if (session?.user) {
            const skip = typeof window !== 'undefined' ? localStorage.getItem('skipModeConfirmation_DEMO') : null;
            if (skip === 'true') {
                confirmSwitchToDemo(false);
            } else {
                setShowDemoDialog(true);
            }
        } else {
            setShowSignupModal(true);
        }
    };

    const confirmSwitchToDemo = async (dontShowAgain: boolean = false) => {
        setIsSwitching(true);

        if (dontShowAgain && typeof window !== 'undefined') {
            localStorage.setItem('skipModeConfirmation_DEMO', 'true');
        }

        try {
            const response = await fetch('/api/account/toggle-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'DEMO' })
            });

            const data = await response.json();

            if (data.success) {
                // Invalidate queries to refetch fresh data
                await queryClient.invalidateQueries({ queryKey: ['balance'] });
                await queryClient.invalidateQueries({ queryKey: ['userBalance'] });

                setShowDemoDialog(false);
                router.push('/');
            }
        } catch (error) {
            console.error('Error switching to demo mode:', error);
        } finally {
            setIsSwitching(false);
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

    const handlePromoEvent = () => {
        if (topEvent?.id) {
            const path = topEvent.slug ? `/event/${topEvent.slug}` : `/event/${topEvent.id}`;
            router.push(path);
        }
    };

    // Main slider banners (rotate through these)
    const mainBanners = [
        {
            id: 'promo-event',
            title: topEvent?.title || 'Trending Market',
            subtitle: 'Most popular by trading volume',
            buttonText: 'Trade Now',
            onClick: handlePromoEvent,
            imageUrl: topEvent?.imageUrl,
            bannerImage: null,
            disabled: !topEvent,
        },
        {
            id: 'demo',
            title: 'Start with $10,000',
            subtitle: 'Practice trading with demo funds - zero risk, full experience',
            buttonText: 'Get Started',
            onClick: handleDemoBalance,
            imageUrl: null,
            bannerImage: null, // Could add a demo balance image here
            disabled: false,
        },
        {
            id: 'suggest',
            title: 'Create Your Market',
            subtitle: 'Propose an event and let the community trade on it',
            buttonText: 'Suggest Event',
            onClick: handleSuggestEvent,
            imageUrl: null,
            bannerImage: '/banners/create-market-3d.png',
            disabled: false,
        },
    ];

    const validMainBanners = mainBanners.filter(b => !b.disabled);

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

                            {/* Featured Event 3D Graphic */}
                            {currentBanner?.id === 'promo-event' && (
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
                                                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.6" />
                                                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
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

                            {/* 3D Banner Image (for suggest/create market) */}
                            {currentBanner?.bannerImage && !currentBanner?.imageUrl && (
                                <div className="absolute right-0 top-0 bottom-0 w-2/3 sm:w-1/2 lg:w-1/2 flex items-center justify-end">
                                    <div className="relative w-full h-full">
                                        <Image
                                            src={currentBanner.bannerImage}
                                            alt={currentBanner.title}
                                            fill
                                            unoptimized
                                            sizes="(max-width: 640px) 250px, (max-width: 1024px) 350px, 450px"
                                            priority
                                            className="object-contain object-right scale-110"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Fallback 3D CSS graphic for demo balance (no image provided) */}
                            {!currentBanner?.imageUrl && !currentBanner?.bannerImage && currentBanner?.id === 'demo' && (
                                <div className="absolute right-2 sm:right-4 lg:right-12 top-1/2 -translate-y-1/2">
                                    <div className="relative w-24 h-24 sm:w-36 sm:h-36 lg:w-48 lg:h-48">
                                        {/* Outer glow */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" />

                                        {/* 3D Coin stack */}
                                        <div className="absolute inset-4 flex items-center justify-center">
                                            {/* Bottom coins (stack effect) */}
                                            <div className="absolute w-16 h-16 sm:w-24 sm:h-24 lg:w-32 lg:h-32">
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-3 sm:w-20 sm:h-4 lg:w-28 lg:h-5 bg-gradient-to-b from-blue-600 to-blue-800 rounded-full transform -translate-y-0" />
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-3 sm:w-20 sm:h-4 lg:w-28 lg:h-5 bg-gradient-to-b from-blue-500 to-blue-700 rounded-full transform -translate-y-2 sm:-translate-y-3 lg:-translate-y-4" />
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-3 sm:w-20 sm:h-4 lg:w-28 lg:h-5 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full transform -translate-y-4 sm:-translate-y-6 lg:-translate-y-8" />
                                            </div>

                                            {/* Main coin */}
                                            <div
                                                className="relative w-14 h-14 sm:w-20 sm:h-20 lg:w-28 lg:h-28 bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 rounded-full shadow-2xl flex items-center justify-center border-2 sm:border-4 border-blue-300/50"
                                                style={{ transform: 'translateY(-8px)' }}
                                            >
                                                <div className="absolute inset-1 sm:inset-2 rounded-full border border-blue-200/30" />
                                                <span className="text-white font-black text-sm sm:text-lg lg:text-2xl">$10K</span>
                                                <div className="absolute top-1 left-1/4 w-4 h-1 sm:w-6 sm:h-2 bg-white/40 rounded-full blur-sm transform -rotate-45" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Text Background Gradient - for better readability on mobile */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#0a1628] via-[#0a1628]/90 to-transparent w-3/4 sm:w-2/3 lg:w-1/2 z-[5]" />

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
                                            className={`h-1.5 rounded-full transition-all duration-300 ${currentSlide === index
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

                        {/* Mini Banner 1: Discord */}
                        <div
                            onClick={() => window.open('https://discord.gg/zdm8sVgg', '_blank', 'noopener,noreferrer')}
                            className="relative flex-1 h-32 sm:h-40 lg:h-[calc(50%-0.5rem)] rounded-2xl overflow-hidden cursor-pointer group"
                        >
                            {/* Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#1a2744] via-[#0d1a2d] to-[#0a1628]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#5865F2]/20 rounded-full blur-2xl" />
                            </div>

                            {/* 3D Discord Image */}
                            <div className="absolute right-0 top-0 bottom-0 w-3/5 sm:w-3/5 flex items-center justify-end">
                                <div className="relative w-full h-full">
                                    <Image
                                        src="/banners/discord-3d.png"
                                        alt="Join Discord"
                                        fill
                                        unoptimized
                                        sizes="(max-width: 640px) 180px, (max-width: 1024px) 180px, 200px"
                                        className="object-contain object-right scale-125 sm:scale-100"
                                    />
                                </div>
                            </div>

                            {/* Text Background - for mobile readability */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#1a2744] via-[#1a2744]/90 to-transparent w-2/5 sm:w-1/2 z-[5]" />

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-3 sm:p-5 max-w-[40%] sm:max-w-[50%]">
                                <span className="text-[10px] sm:text-xs font-semibold text-[#5865F2] uppercase tracking-wider mb-0.5 sm:mb-1">Community</span>
                                <h3 className="text-sm sm:text-lg font-bold text-white mb-0.5 sm:mb-1">Join Discord</h3>
                                <p className="text-[10px] sm:text-xs text-blue-100/70 hidden sm:block">Stay updated & connect</p>
                            </div>

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[15]" />
                        </div>

                        {/* Mini Banner 2: Referral */}
                        <div
                            onClick={handleReferral}
                            className="relative flex-1 h-32 sm:h-40 lg:h-[calc(50%-0.5rem)] rounded-2xl overflow-hidden cursor-pointer group"
                        >
                            {/* Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#1a2744] via-[#0d1a2d] to-[#0a1628]">
                                <div className="absolute bottom-0 right-0 w-40 h-40 bg-blue-500/15 rounded-full blur-2xl" />
                            </div>

                            {/* 3D Referral Image */}
                            <div className="absolute right-0 top-0 bottom-0 w-3/5 sm:w-3/5 flex items-center justify-end">
                                <div className="relative w-full h-full">
                                    <Image
                                        src="/banners/referral-3d.png"
                                        alt="Refer Friends"
                                        fill
                                        unoptimized
                                        sizes="(max-width: 640px) 180px, (max-width: 1024px) 180px, 200px"
                                        className="object-contain object-right scale-125 sm:scale-100"
                                    />
                                </div>
                            </div>

                            {/* Text Background - for mobile readability */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1a2d] via-[#0d1a2d]/90 to-transparent w-2/5 sm:w-1/2 z-[5]" />

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-3 sm:p-5 max-w-[40%] sm:max-w-[50%]">
                                <span className="text-[10px] sm:text-xs font-semibold text-blue-400 uppercase tracking-wider mb-0.5 sm:mb-1">Earn Rewards</span>
                                <h3 className="text-sm sm:text-lg font-bold text-white mb-0.5 sm:mb-1">Refer Friends</h3>
                                <p className="text-[10px] sm:text-xs text-blue-100/70 hidden sm:block">Get % from their trades</p>
                            </div>

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[15]" />
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
            <SwitchToDemoDialog
                isOpen={showDemoDialog}
                onClose={() => setShowDemoDialog(false)}
                onConfirm={confirmSwitchToDemo}
                isSwitching={isSwitching}
            />
        </>
    );
}
