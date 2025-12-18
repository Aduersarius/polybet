'use client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { Plus, Wallet } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth-client';
import { LoginModal } from './auth/LoginModal';
import { SignupModal } from './auth/SignupModal';
import { useQuery } from '@tanstack/react-query';
import { EnhancedDepositModal } from '@/components/wallet/EnhancedDepositModal';
import { BalanceDropdown } from './BalanceDropdown';
import { useSearchParams, useRouter } from 'next/navigation';
import { OnboardingTour } from './OnboardingTour';
import { useCustomTour } from '@/contexts/CustomTourContext';
import { CreateEventModal } from './admin/CreateEventModal';


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

function NavbarContent({ selectedCategory = 'ALL', onCategoryChange, isAdminPage, activeAdminView, onAdminViewChange, onCreateEvent }: NavbarProps) {
    const [scrolled, setScrolled] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showSuggestModal, setShowSuggestModal] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const { startTour } = useCustomTour();
    const [balance, setBalance] = useState<number>(0);
    const [isMounted, setIsMounted] = useState(false); // Prevent hydration mismatch
    const categories: Category[] = [
        { id: 'ALL', label: 'All' },
        { id: 'TRENDING', label: 'Trending' },
        { id: 'NEW', label: 'New' },
        { id: 'BUSINESS', label: 'Business' },
        { id: 'CRYPTO', label: 'Crypto' },
        { id: 'CULTURE', label: 'Culture' },
        { id: 'ECONOMY', label: 'Economy' },
        { id: 'ELECTIONS', label: 'Elections' },
        { id: 'FINANCE', label: 'Finance' },
        { id: 'POLITICS', label: 'Politics' },
        { id: 'SCIENCE', label: 'Science' },
        { id: 'SPORTS', label: 'Sports' },
        { id: 'TECH', label: 'Tech' },
        { id: 'WORLD', label: 'World' },
    ];
    const { data: session } = useSession();
    
    // Only render session-dependent UI after mounting on client
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Fetch balance when user logs in
    useEffect(() => {
        if ((session as any)?.user) {
            fetch('/api/balance')
                .then(res => res.json())
                .then(data => setBalance(data.balance))
                .catch(err => console.error('Failed to fetch balance:', err));
        }
    }, [session]);

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
        await (authClient as any).signOut();
        window.location.reload();
    };

    return (
        <>
            {/* Extended background for navbar overscroll */}
            <div className="fixed inset-x-0 top-0 -translate-y-full h-screen bg-black/80 backdrop-blur-md pointer-events-none -z-10" />

            <nav className="border-b border-blue-400/20 bg-[#1a1f2e]/80 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_4px_24px_rgba(59,130,246,0.08)]" style={{ boxShadow: '0 -100vh 0 100vh rgba(26, 31, 46, 0.8), 0 4px 24px rgba(59, 130, 246, 0.08)' }}>
                <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
                    <div className="flex items-center justify-between h-18 gap-6">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3 group py-2">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg blur-lg opacity-40 group-hover:opacity-60 transition-opacity"></div>
                                <img src="/diamond_logo_nobg.png" alt="PolyBet Logo" className="relative h-10 w-auto object-contain group-hover:scale-110 transition-all duration-300 drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
                            </div>
                            <span className="text-2xl font-bold tracking-tight group-hover:scale-105 transition-all duration-300 uppercase bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent" style={{letterSpacing: '0.05em'}}>
                                PolyBet
                            </span>
                        </Link>

                        {/* Search */}
                        <div className="flex-1 ml-4 sm:ml-6 lg:ml-10 mr-2 hidden md:flex items-center gap-3">
                            <SearchBar onSearch={handleSearch} />
                            <button
                                onClick={() => startTour()}
                                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors whitespace-nowrap font-medium uppercase tracking-wide"
                                aria-label="Get started"
                                title="Get started"
                            >
                                <span>Get started</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
                                        className="deposit-button hidden md:inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-bold transition-all duration-300 uppercase tracking-wide shadow-[0_4px_16px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_24px_rgba(16,185,129,0.4)] hover:scale-105"
                                    >
                                        <Wallet className="w-4 h-4" />
                                        Deposit
                                    </button>
                                    {/* Portfolio moved into balance dropdown */}
                                </>
                            )}
                            {isMounted && session && <NotificationBell />}


                            {/* Authentication */}
                            {isMounted && session ? (
                                <div className="flex items-center gap-2 sm:gap-3">
                                    {/* Balance Display */}
                                    <BalanceDropdown balance={balance} />

                                    {/* User Profile Dropdown */}
                                    < div className="relative group" >
                                        <button className="flex items-center gap-2 focus:outline-none">
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black font-bold text-sm overflow-hidden border border-white/20 hover:bg-gray-100 transition-all">
                                                {(session as any).user?.image ? (
                                                    <img src={(session as any).user.image} alt="User" className="w-full h-full object-cover" />
                                                ) : (
                                                    (session as any).user?.name?.charAt(0).toUpperCase() || (session as any).user?.email?.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                        </button>

                                        {/* Dropdown Menu */}
                                        <div className="absolute right-0 mt-2 w-60 bg-[#1a1f2e]/95 backdrop-blur-xl border border-blue-400/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-right z-50">
                                            <div className="p-4 border-b border-blue-400/10 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                                                <p className="text-sm font-bold text-white truncate">{(session as any).user?.name || 'User'}</p>
                                                <p className="text-xs text-white/60 truncate mt-1">{(session as any).user?.email}</p>
                                            </div>
                                            <div className="py-2 px-2">
                                                <Link href="/profile" className="block px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    Profile
                                                </Link>
                                                <Link href="/settings" className="block px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    Settings
                                                </Link>
                                                <Link href="/faq" className="block px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-purple-500/10 rounded-xl transition-all duration-200 font-medium">
                                                    ❓ Help & FAQ
                                                </Link>
                                                <button
                                                    onClick={() => setShowSuggestModal(true)}
                                                    className="block w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-blue-500/10 rounded-xl transition-all duration-200 font-medium"
                                                >
                                                    Suggest event
                                                </button>
                                                <button
                                                    onClick={() => startTour()}
                                                    className="block w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-emerald-500/10 rounded-xl transition-all duration-200 font-medium"
                                                >
                                                    🎓 Show Tour
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
                                    <button
                                        onClick={() => setShowLoginModal(true)}
                                        className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-blue-400/30 text-white hover:bg-white/15 hover:border-blue-400/50 text-xs font-bold px-5 transition-all duration-300 uppercase tracking-wide hover:shadow-[0_4px_16px_rgba(59,130,246,0.2)]"
                                    >
                                        Login
                                    </button>
                                    <button
                                        onClick={() => setShowSignupModal(true)}
                                        className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-bold px-5 transition-all duration-300 uppercase tracking-wide shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] hover:scale-105"
                                    >
                                        Sign Up
                                    </button>
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
                {
                    onCategoryChange && (
                        <div className="w-full bg-[#1a1f2e]/60 border-t border-blue-400/10 backdrop-blur-xl">
                            <div className="max-w-7xl mx-auto px-6 py-2.5">
                                <div className="overflow-x-auto scrollbar-hide">
                                    <div className="flex items-center gap-2 category-nav">
                                        <div className="flex gap-1.5 min-w-max">
                                            {categories.map((cat) => (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => onCategoryChange(cat.id)}
                                                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 whitespace-nowrap uppercase tracking-wide ${selectedCategory === cat.id
                                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.4)] scale-105'
                                                        : 'bg-white/5 backdrop-blur-sm text-gray-400 hover:text-white border border-white/10 hover:border-blue-400/30 hover:bg-white/10 hover:shadow-[0_4px_12px_rgba(59,130,246,0.15)]'
                                                        }`}
                                                >
                                                    {cat.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="h-5 w-px bg-blue-400/20"></div>
                                        <button
                                            onClick={() => onCategoryChange('FAVORITES')}
                                            className={`p-1.5 rounded-lg transition-all duration-300 whitespace-nowrap flex items-center justify-center ${selectedCategory === 'FAVORITES'
                                                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-[0_4px_16px_rgba(244,63,94,0.4)]'
                                                : 'bg-white/5 text-gray-400 hover:text-pink-400 border border-white/10 hover:border-pink-400/30 hover:bg-pink-500/10'
                                                }`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill={selectedCategory === 'FAVORITES' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

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
                    // Refresh balance
                    fetch('/api/balance')
                        .then(res => res.json())
                        .then(data => setBalance(data.balance));
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
