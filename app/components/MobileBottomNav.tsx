'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Zap, Menu, TrendingUp, User, Wallet, Settings, HelpCircle, LogOut, X, ChevronRight, Trophy, FileText, Shield, Headphones, BookOpen } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { LoginModal } from './auth/LoginModal';
import { SignupModal } from './auth/SignupModal';
import { EnhancedDepositModal } from '@/components/wallet/EnhancedDepositModal';
import { useBalance } from '@/hooks/use-balance';
import { motion, AnimatePresence } from 'framer-motion';

interface MobileBottomNavProps {
    onSearchClick?: () => void;
}

export function MobileBottomNav({ onSearchClick }: MobileBottomNavProps) {
    const pathname = usePathname();
    const { data: rawSession } = useSession();
    const session = (rawSession as any)?.session?.isTwoFactorRequired ? null : rawSession;
    const { data: balanceData } = useBalance();
    const balance = balanceData ?? 0;

    const [showMenu, setShowMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Hide on admin pages
    if (pathname?.startsWith('/admin')) {
        return null;
    }

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/';
        return pathname?.startsWith(path);
    };

    const handleSearchSubmit = () => {
        if (searchQuery.trim()) {
            window.dispatchEvent(new CustomEvent('globalSearch', { detail: { query: searchQuery } }));
            setShowSearch(false);
            setSearchQuery('');
        }
    };

    const quickFilters = [
        { label: 'New', icon: '✨', category: 'NEW' },
        { label: 'Trending', icon: '📈', category: 'TRENDING' },
        { label: 'Politics', icon: '🏛️', category: 'POLITICS' },
        { label: 'Crypto', icon: '₿', category: 'CRYPTO' },
        { label: 'Sports', icon: '⚽', category: 'SPORTS' },
        { label: 'Tech', icon: '💻', category: 'TECH' },
    ];

    const navItems = [
        { 
            id: 'home', 
            label: 'Home', 
            icon: Home, 
            href: '/',
            action: undefined 
        },
        { 
            id: 'search', 
            label: 'Search', 
            icon: Search, 
            href: undefined,
            action: () => setShowSearch(true)
        },
        { 
            id: 'trending', 
            label: 'Trending', 
            icon: Zap, 
            href: '/?category=TRENDING',
            action: undefined 
        },
        { 
            id: 'more', 
            label: 'More', 
            icon: Menu, 
            href: undefined,
            action: () => setShowMenu(true) 
        },
    ];

    if (!mounted) return null;

    return (
        <>
            {/* Bottom Navigation Bar */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[80] bg-[#0a0c12]/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
                <div className="flex items-center justify-around h-14 px-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = item.href ? isActive(item.href) : (item.id === 'search' && showSearch) || (item.id === 'more' && showMenu);

                        if (item.action) {
                            return (
                                <button
                                    key={item.id}
                                    onClick={item.action}
                                    className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors"
                                >
                                    <Icon 
                                        className={`w-5 h-5 transition-colors ${
                                            active ? 'text-blue-400' : 'text-gray-400'
                                        }`} 
                                    />
                                    <span className={`text-[10px] font-medium transition-colors ${
                                        active ? 'text-blue-400' : 'text-gray-500'
                                    }`}>
                                        {item.label}
                                    </span>
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={item.id}
                                href={item.href!}
                                className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors"
                            >
                                <Icon 
                                    className={`w-5 h-5 transition-colors ${
                                        active ? 'text-blue-400' : 'text-gray-400'
                                    }`} 
                                />
                                <span className={`text-[10px] font-medium transition-colors ${
                                    active ? 'text-blue-400' : 'text-gray-500'
                                }`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* Search Drawer */}
            <AnimatePresence>
                {showSearch && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[85]"
                            onClick={() => setShowSearch(false)}
                        />

                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="md:hidden fixed bottom-0 left-0 right-0 z-[90] bg-[#0f1117] border-t border-white/10 rounded-t-3xl max-h-[85vh] overflow-hidden"
                        >
                            {/* Handle */}
                            <div className="flex justify-center pt-3 pb-2">
                                <div className="w-10 h-1 bg-white/20 rounded-full" />
                            </div>

                            {/* Close button */}
                            <button
                                onClick={() => setShowSearch(false)}
                                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="px-4 pb-8">
                                {/* Search Input */}
                                <div className="relative mb-4">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                                        placeholder="Search markets..."
                                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 text-base"
                                        autoFocus
                                    />
                                </div>

                                {/* Browse Categories */}
                                <div className="mb-6">
                                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-3">
                                        Browse
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {quickFilters.map((filter) => (
                                            <Link
                                                key={filter.category}
                                                href={`/?category=${filter.category}`}
                                                onClick={() => setShowSearch(false)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-white transition-colors"
                                            >
                                                <span>{filter.icon}</span>
                                                <span>{filter.label}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>

                                {/* Recent Searches Placeholder */}
                                <div>
                                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-3">
                                        Popular
                                    </p>
                                    <div className="space-y-1">
                                        {['Bitcoin price prediction', 'US Elections 2024', 'Super Bowl winner', 'AI developments'].map((term) => (
                                            <button
                                                key={term}
                                                onClick={() => {
                                                    setSearchQuery(term);
                                                    handleSearchSubmit();
                                                }}
                                                className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 rounded-xl transition-colors text-left"
                                            >
                                                <Search className="w-4 h-4 text-gray-500" />
                                                <span className="text-sm text-gray-300">{term}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* More Menu Drawer */}
            <AnimatePresence>
                {showMenu && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[85]"
                            onClick={() => setShowMenu(false)}
                        />

                        {/* Drawer */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="md:hidden fixed bottom-0 left-0 right-0 z-[90] bg-[#0f1117] border-t border-white/10 rounded-t-3xl max-h-[85vh] overflow-hidden"
                        >
                            {/* Handle */}
                            <div className="flex justify-center pt-3 pb-2">
                                <div className="w-10 h-1 bg-white/20 rounded-full" />
                            </div>

                            {/* Close button */}
                            <button
                                onClick={() => setShowMenu(false)}
                                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="px-4 pb-8 overflow-y-auto max-h-[calc(85vh-60px)]">
                                {/* User Section */}
                                {session ? (
                                    <div className="mb-4">
                                        {/* User Info */}
                                        <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                                {(session as any).user?.image ? (
                                                    <img src={(session as any).user.image} alt="" className="w-full h-full object-cover rounded-full" />
                                                ) : (
                                                    (session as any).user?.name?.charAt(0).toUpperCase() || (session as any).user?.email?.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">
                                                    {(session as any).user?.name || 'User'}
                                                </p>
                                                <p className="text-xs text-gray-400 truncate">
                                                    {(session as any).user?.email}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-white">${balance.toFixed(2)}</p>
                                                <p className="text-[10px] text-gray-500 uppercase">Balance</p>
                                            </div>
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="grid grid-cols-2 gap-2 mt-3">
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    setShowDepositModal(true);
                                                }}
                                                className="flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl text-white text-sm font-semibold transition-colors"
                                            >
                                                <Wallet className="w-4 h-4" />
                                                Deposit
                                            </button>
                                            <Link
                                                href="/withdraw"
                                                onClick={() => setShowMenu(false)}
                                                className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white text-sm font-semibold transition-colors"
                                            >
                                                <TrendingUp className="w-4 h-4" />
                                                Withdraw
                                            </Link>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-4 p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl border border-blue-500/20">
                                        <h3 className="text-base font-semibold text-white mb-2">Join Pariflow</h3>
                                        <p className="text-xs text-gray-400 mb-4">Trade on prediction markets and profit from your insights.</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    setShowLoginModal(true);
                                                }}
                                                className="py-2.5 bg-white/10 hover:bg-white/15 rounded-xl text-white text-sm font-semibold transition-colors"
                                            >
                                                Log In
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    setShowSignupModal(true);
                                                }}
                                                className="py-2.5 bg-blue-500 hover:bg-blue-600 rounded-xl text-white text-sm font-semibold transition-colors"
                                            >
                                                Sign Up
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Menu Items - Account */}
                                {session && (
                                    <div className="mb-4">
                                        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider px-2 mb-2">
                                            Account
                                        </p>
                                        <div className="space-y-1">
                                            <MenuLink 
                                                href="/profile" 
                                                icon={User} 
                                                label="Profile" 
                                                onClick={() => setShowMenu(false)} 
                                            />
                                            <MenuLink 
                                                href="/portfolio" 
                                                icon={TrendingUp} 
                                                label="My Bets" 
                                                onClick={() => setShowMenu(false)} 
                                            />
                                            <MenuLink 
                                                href="/settings" 
                                                icon={Settings} 
                                                label="Settings" 
                                                onClick={() => setShowMenu(false)} 
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Leaderboard */}
                                <div className="mb-4">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider px-2 mb-2">
                                        Community
                                    </p>
                                    <div className="space-y-1">
                                        <MenuLink 
                                            href="/leaderboard" 
                                            icon={Trophy} 
                                            label="Leaderboard" 
                                            onClick={() => setShowMenu(false)}
                                        />
                                    </div>
                                </div>

                                {/* Resources */}
                                <div className="mb-4">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider px-2 mb-2">
                                        Resources
                                    </p>
                                    <div className="space-y-1">
                                        <MenuLink 
                                            href="/faq" 
                                            icon={HelpCircle} 
                                            label="Help & FAQ" 
                                            onClick={() => setShowMenu(false)} 
                                        />
                                        <MenuLinkExternal 
                                            href="https://docs.pariflow.com" 
                                            icon={BookOpen} 
                                            label="Documentation" 
                                            onClick={() => setShowMenu(false)} 
                                        />
                                        <MenuLink 
                                            href="/legal/terms" 
                                            icon={FileText} 
                                            label="Terms of Use" 
                                            onClick={() => setShowMenu(false)} 
                                        />
                                        <MenuLink 
                                            href="/legal/privacy-policy" 
                                            icon={Shield} 
                                            label="Privacy Policy" 
                                            onClick={() => setShowMenu(false)} 
                                        />
                                    </div>
                                </div>

                                {/* Social Links */}
                                <div className="mb-4">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider px-2 mb-3">
                                        Follow Us
                                    </p>
                                    <div className="flex items-center gap-3 px-2">
                                        <a 
                                            href="https://x.com/pariflow" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                            </svg>
                                        </a>
                                        <a 
                                            href="https://discord.gg/zdm8sVgg" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                                            </svg>
                                        </a>
                                        <a 
                                            href="https://www.instagram.com/pariflow_official/" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                            </svg>
                                        </a>
                                        <a 
                                            href="https://t.me/pariflow" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                            </svg>
                                        </a>
                                    </div>
                                </div>

                                {/* Admin link */}
                                {session && (session as any).user?.isAdmin && (
                                    <div className="mb-4">
                                        <MenuLink 
                                            href="/admin" 
                                            icon={Settings} 
                                            label="Admin Panel" 
                                            onClick={() => setShowMenu(false)}
                                            highlight
                                        />
                                    </div>
                                )}

                                {/* Sign Out */}
                                {session && (
                                    <div className="pt-4 border-t border-white/10">
                                        <button
                                            onClick={async () => {
                                                setShowMenu(false);
                                                await signOut();
                                            }}
                                            className="flex items-center justify-between w-full px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <LogOut className="w-5 h-5" />
                                                <span className="text-sm font-medium">Sign Out</span>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {/* Bottom Padding for safe area */}
                                <div className="h-8" />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Modals */}
            <LoginModal
                isOpen={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                onSwitchToSignup={() => {
                    setShowLoginModal(false);
                    setShowSignupModal(true);
                }}
            />
            <SignupModal
                isOpen={showSignupModal}
                onClose={() => setShowSignupModal(false)}
                onSwitchToLogin={() => {
                    setShowSignupModal(false);
                    setShowLoginModal(true);
                }}
            />
            <EnhancedDepositModal
                isOpen={showDepositModal}
                onClose={() => setShowDepositModal(false)}
            />

            {/* Spacer to prevent content from being hidden behind nav */}
            <div className="md:hidden h-14" />
        </>
    );
}

// Helper component for menu links
function MenuLink({ 
    href, 
    icon: Icon, 
    label, 
    onClick,
    highlight = false,
    badge
}: { 
    href: string; 
    icon: any; 
    label: string; 
    onClick: () => void;
    highlight?: boolean;
    badge?: string;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                highlight 
                    ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300' 
                    : 'hover:bg-white/5 text-white'
            }`}
        >
            <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium">{label}</span>
                {badge && (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-medium rounded-full">
                        {badge}
                    </span>
                )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>
    );
}

// Helper component for external links
function MenuLinkExternal({ 
    href, 
    icon: Icon, 
    label, 
    onClick
}: { 
    href: string; 
    icon: any; 
    label: string; 
    onClick: () => void;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClick}
            className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors hover:bg-white/5 text-white"
        >
            <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
        </a>
    );
}
