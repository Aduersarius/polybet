'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
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
import { PositionsDropdown } from './PositionsDropdown';

const categories = [
    { id: 'ALL', label: 'All' },
    { id: 'TRENDING', label: 'Trending' },
    { id: 'NEW', label: 'New' },
    { id: 'CRYPTO', label: 'Crypto' },
    { id: 'SPORTS', label: 'Sports' },
    { id: 'POLITICS', label: 'Politics' },
    { id: 'FINANCE', label: 'Finance' },
    { id: 'TECH', label: 'Tech' },
    { id: 'CULTURE', label: 'Culture' },
    { id: 'WORLD', label: 'World' },
    { id: 'ECONOMY', label: 'Economy' },
    { id: 'ELECTIONS', label: 'Elections' },
    { id: 'SCIENCE', label: 'Science' },
];

interface NavbarProps {
    selectedCategory?: string;
    onCategoryChange?: (categoryId: string) => void;
    isAdminPage?: boolean;
    activeAdminView?: string;
    onAdminViewChange?: (view: string) => void;
    onCreateEvent?: () => void;
}

export function Navbar({ selectedCategory = 'ALL', onCategoryChange, isAdminPage, activeAdminView, onAdminViewChange, onCreateEvent }: NavbarProps) {
    const [scrolled, setScrolled] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [balance, setBalance] = useState<number>(0);
    const { data: session } = useSession();

    // Fetch balance when user logs in
    useEffect(() => {
        if ((session as any)?.user) {
            fetch('/api/balance')
                .then(res => res.json())
                .then(data => setBalance(data.balance))
                .catch(err => console.error('Failed to fetch balance:', err));
        }
    }, [session]);

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
                <div className="max-w-7xl mx-auto px-14 sm:px-8 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-1 group">
                            <img src="/diamond_logo_nobg.png" alt="PolyBet Logo" className="h-10 w-auto object-contain group-hover:scale-105 transition-transform" />
                            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-blue-500 bg-clip-text text-transparent group-hover:from-blue-300 group-hover:via-purple-300 group-hover:to-blue-400 transition-all">
                                PolyBet
                            </span>
                        </Link>

                        {/* Search */}
                        <div className="flex-1 ml-10 mr-6 hidden md:block">
                            <SearchBar onSearch={handleSearch} />
                        </div>

                        {/* Right Side */}
                        <div className="flex items-center gap-4">
                            {session && (
                                <>
                                    <button
                                        onClick={() => setShowDepositModal(true)}
                                        className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-sm font-medium transition-colors border border-green-500/20"
                                    >
                                        <Wallet className="w-4 h-4" />
                                        Deposit
                                    </button>
                                    <PositionsDropdown />
                                </>
                            )}

                            <NotificationBell />

                            {/* Authentication */}
                            {session ? (
                                <div className="flex items-center gap-3">
                                    {/* Balance Display */}
                                    <div className="hidden md:flex flex-col items-end mr-2">
                                        <span className="text-sm font-bold text-white">${balance.toFixed(2)}</span>
                                    </div >

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
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowLoginModal(true)}
                                        className="px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-sm transition-colors"
                                    >
                                        Login
                                    </button>
                                    <button
                                        onClick={() => setShowSignupModal(true)}
                                        className="px-3 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm transition-colors"
                                    >
                                        Sign Up
                                    </button>
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
                                    <div className="flex gap-2 min-w-max justify-center items-center">
                                        {categories.map((cat) => (
                                            <button
                                                key={cat.id}
                                                onClick={() => onCategoryChange(cat.id)}
                                                className={`px-4 py-1.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${selectedCategory === cat.id
                                                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                                                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                                                    }`}
                                            >
                                                {cat.label}
                                            </button>
                                        ))}
                                        <div className="w-px h-6 bg-white/20 mx-2" />
                                        <button
                                            onClick={() => onCategoryChange('FAVORITES')}
                                            className={`p-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center justify-center ${selectedCategory === 'FAVORITES'
                                                ? 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg'
                                                : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
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
                        <div className="w-full bg-[#1e1e1e] backdrop-blur-sm border-t border-white/5">
                            <div className="max-w-7xl mx-auto px-4 py-2">
                                <div className="flex items-center justify-between">
                                    {/* Left: Title + Tabs */}
                                    <div className="flex items-center gap-6">
                                        <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                                            Admin
                                        </h2>
                                        <div className="flex gap-1">
                                            {[
                                                { id: 'events', label: 'Events', icon: '📊' },
                                                { id: 'users', label: 'Users', icon: '👥' },
                                                { id: 'statistics', label: 'Statistics', icon: '📈' },
                                            ].map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => onAdminViewChange?.(item.id)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeAdminView === item.id
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-400 hover:bg-white/10 hover:text-white'
                                                        }`}
                                                >
                                                    <span>{item.icon}</span>
                                                    <span>{item.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right: Action Button */}
                                    {activeAdminView === 'events' && onCreateEvent && (
                                        <button
                                            onClick={onCreateEvent}
                                            className="px-3 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors flex items-center gap-1.5"
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
        </>
    );
}
