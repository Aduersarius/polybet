'use client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { Wallet, Trophy } from 'lucide-react';
import { authClient, useSession, signOut } from '@/lib/auth-client';
import { LoginModal } from './auth/LoginModal';
import { SignupModal } from './auth/SignupModal';
import { useQuery } from '@tanstack/react-query';
import { EnhancedDepositModal } from '@/components/wallet/EnhancedDepositModal';
import { BalanceDropdown } from './BalanceDropdown';
import { useSearchParams, useRouter } from 'next/navigation';
import { OnboardingTour } from './OnboardingTour';
import { useCustomTour } from '@/contexts/CustomTourContext';
import { CreateEventModal } from './admin/CreateEventModal';
import { CategoryBar } from './CategoryBar';
import { useSupportChat } from '@/contexts/SupportChatContext';
import { useBalance } from '@/hooks/use-balance';
import { generateAvatarDataUri } from '@/lib/avatar';


interface NavbarProps {
    selectedCategory?: string;
    onCategoryChange?: (categoryId: string) => void;
    isAdminPage?: boolean;
    activeAdminView?: string;
    onAdminViewChange?: (view: string) => void;
    onCreateEvent?: () => void;
}

interface Category {
    id: string;
    label: string;
}

function SupportLink() {
    const { openChat } = useSupportChat();
    return (
        <button
            onClick={() => {
                console.log('Support button clicked, opening chat...');
                openChat();
            }}
            className="block w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-emerald-500/10 rounded-xl transition-all duration-200 font-medium"
        >
            Support
        </button>
    );
}

// Platform stats component for non-authenticated users
function PlatformStats() {
    const [onlineCount, setOnlineCount] = useState(0);

    useEffect(() => {
        // Generate a realistic-looking online count
        // Base: 40-80 users, varies slightly over time
        const generateCount = () => {
            const hour = new Date().getHours();
            // Higher during peak hours (10am-10pm), lower at night
            const isPeakHour = hour >= 10 && hour <= 22;
            const base = isPeakHour ? 65 : 35;
            const variance = Math.floor(Math.random() * 30) - 15; // -15 to +15
            return Math.max(20, base + variance);
        };

        setOnlineCount(generateCount());

        // Update every 30-90 seconds with small changes
        const interval = setInterval(() => {
            setOnlineCount(prev => {
                const change = Math.floor(Math.random() * 7) - 3; // -3 to +3
                return Math.max(15, Math.min(120, prev + change));
            });
        }, 30000 + Math.random() * 60000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-1.5 text-white/70">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/40 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white/80"></span>
            </span>
            <span className="text-xs font-medium text-white/90">
                {onlineCount}
            </span>
            <span className="text-[11px] text-white/50">traders online</span>
        </div>
    );
}

function NavbarContent({ selectedCategory = 'ALL', onCategoryChange, isAdminPage, activeAdminView, onAdminViewChange, onCreateEvent }: NavbarProps) {
    const [scrolled, setScrolled] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showSuggestModal, setShowSuggestModal] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const { startTour } = useCustomTour();
    const [isMounted, setIsMounted] = useState(false);
    const { data: balanceData, refetch: refetchBalance } = useBalance();
    const balance = balanceData ?? 0;

    const categories: Category[] = [
        { id: 'ALL', label: 'All' },
        { id: 'TRENDING', label: 'Trending' },
        { id: 'NEW', label: 'New' },
        { id: 'BUSINESS', label: 'Business' },
        { id: 'CRYPTO', label: 'Crypto' },
        { id: 'CULTURE', label: 'Culture' },
        { id: 'ECONOMY', label: 'Economy' },
        { id: 'ELECTIONS', label: 'Elections' },
        { id: 'ESPORTS', label: 'Esports' },
        { id: 'FINANCE', label: 'Finance' },
        { id: 'POLITICS', label: 'Politics' },
        { id: 'SCIENCE', label: 'Science' },
        { id: 'SPORTS', label: 'Sports' },
        { id: 'TECH', label: 'Tech' },
        { id: 'WORLD', label: 'World' },
    ];
    const { data: rawSession } = useSession();
    const session = (rawSession as any)?.session?.isTwoFactorRequired ? null : rawSession;

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const router = useRouter();
    const searchParams = useSearchParams();

    // Check for auth query param to open modals
    useEffect(() => {
        const authParam = searchParams.get('auth');
        if (authParam === 'login') {
            setShowLoginModal(true);
            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete('auth');
            router.replace(url.pathname + url.search);
        } else if (authParam === 'signup') {
            setShowSignupModal(true);
            const url = new URL(window.location.href);
            url.searchParams.delete('auth');
            router.replace(url.pathname + url.search);
        }
    }, [searchParams, router]);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);


    const handleSearch = (query: string) => {
        window.dispatchEvent(new CustomEvent('globalSearch', { detail: { query } }));
    };

    const handleSignOut = async () => {
        await signOut();
    };

    return (
        <>
            {/* Extended background for navbar overscroll */}
            <div className="fixed inset-x-0 top-0 -translate-y-full h-screen bg-black/40 backdrop-blur-xl backdrop-saturate-150 pointer-events-none -z-10" />

            <nav
                className="border-b border-blue-400/10 bg-black/40 backdrop-blur-xl backdrop-saturate-150 fixed left-0 right-0 z-[90] shadow-[0_4px_24px_rgba(0,0,0,0.3)] transition-all duration-300"
                style={{
                    top: '0',
                    boxShadow: '0 -100vh 0 100vh rgba(0, 0, 0, 0.4), 0 4px 24px rgba(0, 0, 0, 0.3)'
                }}
            >
                <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
                    <div className="flex items-center justify-between h-18 gap-6">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2 group py-2">
                            <div className="relative">
                                <img src="/diamond_logo_nobg.png" alt="Pariflow Logo" className="relative h-10 w-auto object-contain transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                            </div>
                            <span className="text-base font-black tracking-tight transition-all duration-300 uppercase text-white group-hover:[text-shadow:0_0_12px_rgba(255,255,255,0.4)]" style={{ letterSpacing: '0.05em', fontWeight: 800 }}>
                                Pariflow
                            </span>
                        </Link>

                        {/* Search */}
                        <div className="flex-1 ml-4 sm:ml-6 lg:ml-10 mr-2 hidden md:flex items-center gap-3">
                            <SearchBar onSearch={handleSearch} />
                            <button
                                onClick={() => startTour()}
                                className="hidden lg:inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                aria-label="Get started"
                                title="Get started"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h.008v.008h-.008v-.008ZM12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-.75-9.75h1.5v4.5h-1.5v-4.5Zm0-3h1.5v1.5h-1.5v-1.5Z" />
                                </svg>
                            </button>
                        </div>

                        {/* Right Side */}
                        <div className="flex items-center gap-2 sm:gap-3 ml-1">
                            {isMounted && session && (
                                <>
                                    <button
                                        onClick={() => setShowDepositModal(true)}
                                        className="deposit-button hidden md:inline-flex items-center gap-2 h-8 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-bold transition-all duration-300 uppercase tracking-wide shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] hover:scale-105"
                                    >
                                        <Wallet className="w-3.5 h-3.5" />
                                        Deposit
                                    </button>
                                    {/* Portfolio moved into balance dropdown */}
                                </>
                            )}
                            {isMounted && session && <NotificationBell />}


                            {/* Authentication / Platform Stats */}
                            {isMounted && session ? (
                                <div className="flex items-center gap-2 sm:gap-3">
                                    {/* Balance Display */}
                                    <BalanceDropdown balance={balance} />

                                    {/* User Profile Dropdown */}
                                    < div className="relative group" >
                                        <button className="flex items-center gap-1.5 focus:outline-none">
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black font-bold text-sm overflow-hidden border border-white/20 hover:bg-gray-100 transition-all">
                                                <img
                                                    src={(session as any).user?.image || (session as any).user?.avatarUrl || generateAvatarDataUri((session as any).user?.email || (session as any).user?.id || '?', 120)}
                                                    alt="User"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <svg
                                                className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {/* Dropdown Menu */}
                                        <div className="absolute right-0 mt-2 w-60 bg-surface/95 backdrop-blur-xl border border-blue-400/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-right z-50" style={{ backgroundColor: 'var(--surface)' }}>
                                            <div className="p-4 border-b border-blue-400/10 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                                                <p className="text-sm font-bold text-white truncate">{(session as any).user?.name || 'User'}</p>
                                                <p className="text-xs text-white/60 truncate mt-1">{(session as any).user?.email}</p>
                                            </div>
                                            <div className="py-2 px-2">
                                                <Link href="/profile" className="block px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    Profile
                                                </Link>
                                                <Link href="/leaderboard" className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    <Trophy className="w-4 h-4" />
                                                    Leaderboard
                                                </Link>
                                                <Link href="/settings" className="block px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    Settings
                                                </Link>
                                                <Link href="/faq" className="block px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-purple-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    Help &amp; FAQ
                                                </Link>
                                                <SupportLink />
                                                <button
                                                    onClick={() => setShowSuggestModal(true)}
                                                    className="block w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium"
                                                >
                                                    Suggest event
                                                </button>
                                                {(session as any).user?.isAdmin && (
                                                    <Link href="/admin" className="block px-4 py-2.5 text-sm text-white hover:bg-purple-500/10 rounded-xl transition-all duration-200 font-semibold">
                                                        Admin Panel
                                                    </Link>
                                                )}
                                            </div>
                                            <div className="border-t border-blue-400/10 py-2 px-2">
                                                <button
                                                    onClick={handleSignOut}
                                                    className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all duration-200 font-medium"
                                                >
                                                    Sign Out
                                                </button>
                                            </div>
                                        </div>
                                    </div >
                                </div >
                            ) : isMounted ? (
                                <div className="flex items-center gap-2">
                                    {/* Mobile: Show online traders */}
                                    <div className="md:hidden">
                                        <PlatformStats />
                                    </div>
                                    {/* Desktop: Show login/signup buttons */}
                                    <div className="hidden md:flex items-center gap-2">
                                        <button
                                            onClick={() => setShowLoginModal(true)}
                                            className="inline-flex h-8 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-blue-400/30 text-white hover:bg-white/15 hover:border-blue-400/50 text-xs font-bold px-4 transition-all duration-300 uppercase tracking-wide hover:shadow-[0_4px_16px_rgba(59,130,246,0.2)]"
                                        >
                                            Login
                                        </button>
                                        <button
                                            onClick={() => setShowSignupModal(true)}
                                            className="inline-flex h-8 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-bold px-4 transition-all duration-300 uppercase tracking-wide shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] hover:scale-105"
                                        >
                                            Sign Up
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    {/* Placeholder to prevent hydration mismatch */}
                                    <div className="h-10 w-20 bg-transparent" />
                                </div>
                            )
                            }
                        </div >
                    </div >
                </div >

                {/* Bottom Row: Categories - Full Width */}
                {!isAdminPage && (
                    <CategoryBar
                        selectedCategory={selectedCategory}
                        onCategoryChange={(category: string) => {
                            // Handle category change with router navigation
                            if (onCategoryChange) {
                                onCategoryChange(category);
                            } else {
                                // Fallback: use router to navigate
                                router.push(`/?category=${category}`);
                            }
                        }}
                        categories={categories}
                    />
                )}

                {/* Admin Navigation Row */}
                {
                    isAdminPage && (
                        <div className="w-full border-t border-amber-500/20 bg-gradient-to-r from-amber-900/20 via-orange-900/20 to-amber-900/20 backdrop-blur-md">
                            <div className="max-w-6xl mx-auto px-4 md:px-8 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-amber-300 uppercase tracking-wide">Admin</span>
                                        <div className="flex gap-2">
                                            {[
                                                { id: 'events', label: 'Events', icon: '📊' },
                                                { id: 'users', label: 'Users', icon: '👥' },
                                                { id: 'statistics', label: 'Statistics', icon: '📈' },
                                                { id: 'finance', label: 'Money', icon: '💵' },
                                                { id: 'withdraw', label: 'Withdrawals', icon: '🏧' },
                                                { id: 'suggested', label: 'Suggested', icon: '💡' },
                                            ].map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => onAdminViewChange?.(item.id)}
                                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeAdminView === item.id
                                                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/40'
                                                        : 'bg-white/5 text-gray-300 hover:bg-amber-500/20 hover:text-white border border-white/10 hover:border-amber-400/50'
                                                        }`}
                                                >
                                                    <span>{item.icon}</span>
                                                    <span>{item.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {activeAdminView === 'events' && onCreateEvent && (
                                        <button
                                            onClick={onCreateEvent}
                                            className="px-4 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
                                        >
                                            <span className="text-lg">+</span>
                                            <span>Create Event</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }
            </nav >

            {/* Auth Modals */}
            < LoginModal
                isOpen={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                onSwitchToSignup={() => {
                    setShowLoginModal(false);
                    setShowSignupModal(true);
                }}
            />
            < SignupModal
                isOpen={showSignupModal}
                onClose={() => setShowSignupModal(false)}
                onSwitchToLogin={() => {
                    setShowSignupModal(false);
                    setShowLoginModal(true);
                }}
            />
            < EnhancedDepositModal
                isOpen={showDepositModal}
                onClose={() => setShowDepositModal(false)}
                onBalanceUpdate={() => {
                    refetchBalance();
                }}
            />
            <CreateEventModal
                isOpen={showSuggestModal}
                onClose={() => setShowSuggestModal(false)}
                mode="user"
            />
            <OnboardingTour
                isOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
            />
        </>
    );
}

export function Navbar(props: NavbarProps) {
    return (
        <Suspense fallback={<div className="h-16 bg-black/50 border-b border-white/10" />}>
            <NavbarContent {...props} />
        </Suspense>
    );
}
