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
            <div className="fixed inset-x-0 top-0 -translate-y-full h-screen bg-black/50 backdrop-blur-md pointer-events-none -z-10" />

            <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50" style={{ boxShadow: '0 -100vh 0 100vh rgba(0, 0, 0, 0.5)' }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 gap-3">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2 group">
                            <img src="/diamond_logo_nobg.png" alt="PolyBet Logo" className="h-9 w-auto object-contain group-hover:scale-105 transition-transform brightness-0 invert" />
                            <span className="text-xl sm:text-2xl font-bold text-white group-hover:text-gray-100 transition-colors">
                                PolyBet
                            </span>
                        </Link>

                        {/* Search */}
                        <div className="flex-1 ml-4 sm:ml-6 lg:ml-10 mr-2 hidden md:flex items-center gap-3">
                            <SearchBar onSearch={handleSearch} />
                            <button
                                onClick={() => setShowOnboarding(true)}
                                className="inline-flex items-center gap-1.5 text-sm text-gray-200 hover:text-white transition-colors whitespace-nowrap"
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
                                        className="hidden md:inline-flex items-center gap-2 h-10 px-3 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-sm font-medium transition-colors border border-green-500/20"
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
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden border border-white/20">
                                                {(session as any).user?.image ? (
                                                    <img src={(session as any).user.image} alt="User" className="w-full h-full object-cover" />
                                                ) : (
                                                    (session as any).user?.name?.charAt(0).toUpperCase() || (session as any).user?.email?.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                        </button>

                                        {/* Dropdown Menu */}
                                        <div className="absolute right-0 mt-2 w-48 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right z-50">
                                            <div className="p-3 border-b border-white/10">
                                                <p className="text-sm font-medium text-white truncate">{(session as any).user?.name || 'User'}</p>
                                                <p className="text-xs text-gray-400 truncate">{(session as any).user?.email}</p>
                                            </div>
                                            <div className="py-1">
                                                <Link href="/profile" className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                                    Profile
                                                </Link>
                                                <Link href="/settings" className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                                    Settings
                                                </Link>
                                                <button
                                                    onClick={() => setShowSuggestModal(true)}
                                                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                                                >
                                                    Suggest event
                                                </button>
                                                {(session as any).user?.isAdmin && (
                                                    <Link href="/admin" className="block px-4 py-2 text-sm text-blue-400 hover:bg-white/5 hover:text-blue-300 transition-colors">
                                                        Admin Panel
                                                    </Link>
                                                )}
                                            </div>
                                            <div className="border-t border-white/10 py-1">
                                                <button
                                                    onClick={handleSignOut}
                                                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 hover:text-red-300 transition-colors"
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
                                        className="inline-flex h-10 items-center justify-center rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-sm font-semibold px-4 transition-colors"
                                    >
                                        Login
                                    </button>
                                    <button
                                        onClick={() => setShowSignupModal(true)}
                                        className="inline-flex h-10 items-center justify-center rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm font-semibold px-4 transition-colors"
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
                        <div className="w-full bg-black/30 backdrop-blur-sm border-t border-white/5">
                            <div className="max-w-7xl mx-auto px-4 py-2">
                                <div className="overflow-x-auto scrollbar-hide">
                                    <div className="flex items-center gap-4">
                                        <div className="flex gap-2 min-w-max">
                                            {categories.map((cat) => (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => onCategoryChange(cat.id)}
                                                    className={`px-4 py-1.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${selectedCategory === cat.id
                                                        ? 'bg-[#d6dae3]/25 border border-[#d6dae3]/40 text-white shadow-[0_8px_24px_-18px_rgba(214,218,227,0.35)]'
                                                        : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'
                                                        }`}
                                                >
                                                    {cat.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="h-6 w-px bg-white/20"></div>
                                        <button
                                            onClick={() => onCategoryChange('FAVORITES')}
                                            className={`p-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center justify-center ${selectedCategory === 'FAVORITES'
                                                ? 'bg-[#d6dae3]/25 border border-[#d6dae3]/40 text-white shadow-[0_8px_24px_-18px_rgba(214,218,227,0.35)]'
                                                : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'
                                                }`}
                                        >
                                            <svg className="w-5 h-5" fill={selectedCategory === 'FAVORITES' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
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
                        <div className="w-full border-t border-white/5 bg-black/30 backdrop-blur-sm">
                            <div className="max-w-6xl mx-auto px-4 md:px-8 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold text-white">Admin</span>
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
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${activeAdminView === item.id
                                                        ? 'bg-white/10 border-white/20 text-white'
                                                        : 'border-white/10 text-gray-300 hover:bg-white/5'
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
                                            className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-1.5 border border-blue-500/50"
                                        >
                                            <span>+</span>
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
