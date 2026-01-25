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

// 3D Discord Illustration Component
function Discord3DGraphic() {
    return (
        <div className="relative w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32">
            {/* Outer glow */}
            <div className="absolute inset-0 bg-[#5865F2]/30 rounded-3xl blur-2xl animate-pulse" />
            
            {/* 3D Phone/Device */}
            <div className="absolute inset-0 transform perspective-1000">
                {/* Phone body */}
                <div 
                    className="absolute inset-2 bg-gradient-to-br from-[#36393f] to-[#2f3136] rounded-2xl border border-[#5865F2]/30 shadow-2xl overflow-hidden"
                    style={{ transform: 'rotateY(-10deg) rotateX(5deg)' }}
                >
                    {/* Screen content - chat bubbles */}
                    <div className="absolute inset-2 bg-[#2f3136] rounded-xl p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-[#5865F2]" />
                            <div className="h-2 w-12 bg-[#5865F2]/40 rounded-full" />
                        </div>
                        <div className="h-1.5 w-16 bg-white/10 rounded-full ml-5" />
                        <div className="h-1.5 w-10 bg-white/10 rounded-full ml-5" />
                        
                        <div className="flex items-center gap-1.5 mt-2">
                            <div className="w-4 h-4 rounded-full bg-green-500" />
                            <div className="h-2 w-8 bg-green-500/40 rounded-full" />
                        </div>
                        <div className="h-1.5 w-14 bg-white/10 rounded-full ml-5" />
                    </div>
                </div>
                
                {/* Floating notification badge */}
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg animate-bounce">
                    3
                </div>
            </div>

            {/* Floating Discord logos */}
            <div 
                className="absolute -left-2 top-1/4 w-8 h-8 bg-[#5865F2] rounded-xl flex items-center justify-center shadow-lg animate-float"
                style={{ animationDelay: '0s' }}
            >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.076-.14.034-.31-.105-.364a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
            </div>
            
            {/* Floating emoji/reaction */}
            <div 
                className="absolute -right-1 bottom-1/4 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-sm shadow-lg animate-float"
                style={{ animationDelay: '0.5s' }}
            >
                👋
            </div>
        </div>
    );
}

// 3D Referral/Earn Illustration Component
function Referral3DGraphic() {
    return (
        <div className="relative w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32">
            {/* Outer glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-cyan-500/30 rounded-3xl blur-2xl animate-pulse" />
            
            {/* Central gift box */}
            <div className="absolute inset-4 transform perspective-1000">
                <div 
                    className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-2xl flex items-center justify-center"
                    style={{ transform: 'rotateY(-5deg) rotateX(5deg)' }}
                >
                    {/* Gift ribbon */}
                    <div className="absolute inset-x-0 top-1/2 h-3 bg-white/30 -translate-y-1/2" />
                    <div className="absolute inset-y-0 left-1/2 w-3 bg-white/30 -translate-x-1/2" />
                    {/* Bow */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-4">
                        <div className="absolute left-0 w-4 h-4 bg-white/40 rounded-full" />
                        <div className="absolute right-0 w-4 h-4 bg-white/40 rounded-full" />
                    </div>
                    {/* Percentage symbol */}
                    <span className="text-white text-2xl font-black">%</span>
                </div>
            </div>

            {/* Floating coins */}
            <div 
                className="absolute -left-2 top-1/3 w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full shadow-lg animate-float flex items-center justify-center"
                style={{ animationDelay: '0s' }}
            >
                <span className="text-yellow-900 font-bold text-sm">$</span>
            </div>
            
            <div 
                className="absolute -right-1 top-1/4 w-6 h-6 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full shadow-lg animate-float flex items-center justify-center"
                style={{ animationDelay: '0.3s' }}
            >
                <span className="text-yellow-900 font-bold text-xs">$</span>
            </div>
            
            <div 
                className="absolute right-2 -bottom-1 w-5 h-5 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-full shadow-lg animate-float"
                style={{ animationDelay: '0.6s' }}
            />
            
            {/* Floating user icons */}
            <div 
                className="absolute -left-1 bottom-1/4 w-7 h-7 bg-blue-400 rounded-full shadow-lg animate-float flex items-center justify-center border-2 border-white/50"
                style={{ animationDelay: '0.2s' }}
            >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
            </div>
        </div>
    );
}

// 3D Create Market Illustration Component  
function CreateMarket3DGraphic() {
    return (
        <div className="relative w-24 h-24 sm:w-36 sm:h-36 lg:w-48 lg:h-48">
            {/* Outer glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl blur-3xl animate-pulse" />
            
            {/* Main floating card */}
            <div className="absolute inset-6 transform perspective-1000">
                <div 
                    className="absolute inset-0 bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-2xl shadow-2xl border border-blue-500/20 overflow-hidden"
                    style={{ transform: 'rotateY(-8deg) rotateX(5deg)' }}
                >
                    {/* Card content - chart visualization */}
                    <div className="absolute inset-3">
                        {/* Mini chart lines */}
                        <svg className="w-full h-full opacity-60" viewBox="0 0 100 60">
                            <defs>
                                <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.5"/>
                                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
                                </linearGradient>
                            </defs>
                            <path 
                                d="M 0 50 Q 20 40, 30 35 T 50 25 T 70 30 T 100 15" 
                                fill="none" 
                                stroke="#3B82F6" 
                                strokeWidth="2"
                            />
                            <path 
                                d="M 0 50 Q 20 40, 30 35 T 50 25 T 70 30 T 100 15 L 100 60 L 0 60 Z" 
                                fill="url(#chartGradient)"
                            />
                        </svg>
                        {/* Question mark overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-3xl lg:text-4xl font-black text-blue-400/40">?</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating question marks */}
            <div 
                className="absolute -left-2 top-1/4 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg animate-float flex items-center justify-center transform rotate-12"
                style={{ animationDelay: '0s' }}
            >
                <span className="text-white font-bold text-lg">?</span>
            </div>
            
            {/* Floating YES/NO chips */}
            <div 
                className="absolute -right-2 top-1/3 px-2 py-1 bg-green-500 rounded-lg shadow-lg animate-float text-white text-xs font-bold"
                style={{ animationDelay: '0.4s' }}
            >
                YES
            </div>
            
            <div 
                className="absolute -left-1 bottom-1/4 px-2 py-1 bg-red-500 rounded-lg shadow-lg animate-float text-white text-xs font-bold"
                style={{ animationDelay: '0.2s' }}
            >
                NO
            </div>

            {/* Sparkle effects */}
            <div className="absolute top-2 right-4 w-2 h-2 bg-yellow-400 rounded-full animate-ping opacity-75" />
            <div className="absolute bottom-4 right-2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.5s' }} />
            <div className="absolute top-1/3 left-0 w-1.5 h-1.5 bg-purple-400 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.8s' }} />
        </div>
    );
}

// 3D Demo Balance Illustration
function DemoBalance3DGraphic() {
    return (
        <div className="relative w-24 h-24 sm:w-36 sm:h-36 lg:w-48 lg:h-48">
            {/* Outer glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" />
            
            {/* 3D Coin stack */}
            <div className="absolute inset-4 flex items-center justify-center">
                {/* Bottom coins (stack effect) */}
                <div className="absolute w-24 h-24 lg:w-32 lg:h-32">
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-4 lg:w-28 lg:h-5 bg-gradient-to-b from-blue-600 to-blue-800 rounded-full transform -translate-y-0" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-4 lg:w-28 lg:h-5 bg-gradient-to-b from-blue-500 to-blue-700 rounded-full transform -translate-y-3 lg:-translate-y-4" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-4 lg:w-28 lg:h-5 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full transform -translate-y-6 lg:-translate-y-8" />
                </div>
                
                {/* Main coin */}
                <div 
                    className="relative w-20 h-20 lg:w-28 lg:h-28 bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 rounded-full shadow-2xl flex items-center justify-center border-4 border-blue-300/50"
                    style={{ transform: 'translateY(-12px)' }}
                >
                    {/* Inner ring */}
                    <div className="absolute inset-2 rounded-full border-2 border-blue-200/30" />
                    {/* Dollar amount */}
                    <div className="text-center">
                        <span className="text-white font-black text-lg lg:text-2xl">$10K</span>
                    </div>
                    {/* Shine effect */}
                    <div className="absolute top-2 left-1/4 w-6 h-2 bg-white/40 rounded-full blur-sm transform -rotate-45" />
                </div>
            </div>

            {/* Floating smaller coins */}
            <div 
                className="absolute -left-1 top-1/3 w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full shadow-lg animate-float flex items-center justify-center border-2 border-blue-300/50"
                style={{ animationDelay: '0s' }}
            >
                <span className="text-white font-bold text-xs">$</span>
            </div>
            
            <div 
                className="absolute -right-1 top-1/4 w-6 h-6 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full shadow-lg animate-float flex items-center justify-center border-2 border-purple-300/50"
                style={{ animationDelay: '0.3s' }}
            >
                <span className="text-white font-bold text-[10px]">$</span>
            </div>
            
            <div 
                className="absolute right-4 bottom-2 w-5 h-5 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-full shadow-lg animate-float"
                style={{ animationDelay: '0.6s' }}
            />
            
            {/* Sparkles */}
            <div className="absolute top-4 right-8 w-2 h-2 bg-yellow-400 rounded-full animate-ping opacity-75" />
            <div className="absolute bottom-6 left-4 w-1.5 h-1.5 bg-blue-300 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.4s' }} />
        </div>
    );
}

export function PromotionalBanners() {
    const { data: session } = useSession();
    const router = useRouter();
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSuggestModal, setShowSuggestModal] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    // Fetch top event by volume
    const { data: topEvent } = useQuery<DbEvent>({
        queryKey: ['top-event-by-volume'],
        queryFn: async () => {
            const res = await fetch('/api/events?sortBy=volume_high&limit=1');
            if (!res.ok) return null;
            const data = await res.json();
            const event = Array.isArray(data) && data.length > 0 ? data[0] : 
                         (data?.data && Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null);
            return event;
        },
        staleTime: 60_000,
        gcTime: 5 * 60 * 1000,
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
            disabled: !topEvent,
        },
        {
            id: 'demo',
            title: 'Start with $10,000',
            subtitle: 'Practice trading with demo funds - zero risk, full experience',
            buttonText: 'Get Started',
            onClick: handleDemoBalance,
            imageUrl: null,
        },
        {
            id: 'suggest',
            title: 'Create Your Market',
            subtitle: 'Propose an event and let the community trade on it',
            buttonText: 'Suggest Event',
            onClick: handleSuggestEvent,
            imageUrl: null,
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
            {/* CSS for float animation */}
            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }
                .animate-float {
                    animation: float 3s ease-in-out infinite;
                }
            `}</style>

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
                        <div className="relative h-48 sm:h-64 lg:h-80 rounded-2xl overflow-hidden">
                            {/* Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#1a2744] to-[#0d1a2d]">
                                {/* Animated glow effects */}
                                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
                                <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
                                <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-cyan-400/20 rounded-full blur-2xl" />
                            </div>

                            {/* Event Image (if available) */}
                            {currentBanner?.imageUrl && (
                                <div className="absolute right-0 top-0 bottom-0 w-1/2 lg:w-2/5">
                                    <div className="relative h-full">
                                        <Image
                                            src={currentBanner.imageUrl}
                                            alt={currentBanner.title}
                                            fill
                                            quality={90}
                                            sizes="(max-width: 768px) 50vw, 40vw"
                                            priority
                                            className="object-cover object-center opacity-90"
                                            style={{ maskImage: 'linear-gradient(to right, transparent, black 30%)' }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 3D Decorative Elements for non-image banners */}
                            {!currentBanner?.imageUrl && currentBanner?.id === 'demo' && (
                                <div className="absolute right-2 sm:right-4 lg:right-12 top-1/2 -translate-y-1/2">
                                    <DemoBalance3DGraphic />
                                </div>
                            )}

                            {!currentBanner?.imageUrl && currentBanner?.id === 'suggest' && (
                                <div className="absolute right-2 sm:right-4 lg:right-8 top-1/2 -translate-y-1/2">
                                    <CreateMarket3DGraphic />
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
                                <div className="absolute bottom-4 left-6 lg:left-10 flex gap-2">
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
                        
                        {/* Mini Banner 1: Discord */}
                        <div 
                            onClick={() => window.open('https://discord.gg/zdm8sVgg', '_blank', 'noopener,noreferrer')}
                            className="relative flex-1 h-32 sm:h-36 lg:h-[calc(50%-0.5rem)] rounded-2xl overflow-hidden cursor-pointer group"
                        >
                            {/* Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#5865F2]/20 via-[#1a2744] to-[#0d1a2d]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#5865F2]/30 rounded-full blur-2xl" />
                                <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#7289DA]/20 rounded-full blur-xl" />
                            </div>

                            {/* 3D Discord Graphic */}
                            <div className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 transform group-hover:scale-105 transition-transform duration-300">
                                <Discord3DGraphic />
                            </div>

                            {/* Text Background - for mobile readability */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#1a2744]/95 via-[#1a2744]/80 to-transparent w-2/3 sm:w-3/5 z-[5]" />

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-3 sm:p-5 max-w-[60%] sm:max-w-[55%]">
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
                            className="relative flex-1 h-32 sm:h-36 lg:h-[calc(50%-0.5rem)] rounded-2xl overflow-hidden cursor-pointer group"
                        >
                            {/* Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#1a2744] via-[#0d1a2d] to-[#0a1628]">
                                <div className="absolute bottom-0 right-0 w-40 h-40 bg-blue-500/20 rounded-full blur-2xl" />
                                <div className="absolute top-0 left-1/2 w-24 h-24 bg-cyan-400/10 rounded-full blur-xl" />
                            </div>

                            {/* 3D Referral Graphic */}
                            <div className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 transform group-hover:scale-105 transition-transform duration-300">
                                <Referral3DGraphic />
                            </div>

                            {/* Text Background - for mobile readability */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1a2d]/95 via-[#0d1a2d]/80 to-transparent w-2/3 sm:w-3/5 z-[5]" />

                            {/* Content */}
                            <div className="relative z-10 h-full flex flex-col justify-center p-3 sm:p-5 max-w-[60%] sm:max-w-[55%]">
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
        </>
    );
}
