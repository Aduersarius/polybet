'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';

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
}

export function Navbar({ selectedCategory = 'ALL', onCategoryChange }: NavbarProps) {
    const { address, isConnected } = useAccount();
    const [scrolled, setScrolled] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

    // Auto-create user in DB when wallet connects and get avatar
    useEffect(() => {
        if (isConnected && address) {
            fetch(`/api/users/${address}`)
                .then(res => res.json())
                .then(data => {
                    if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
                })
                .catch(err => console.error('Failed to ensure user exists:', err));
        } else {
            setAvatarUrl(null);
        }
    }, [isConnected, address]);

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5 }}
            className={cn(
                "fixed top-0 w-full z-50 transition-all duration-300",
                scrolled ? "bg-black/50 backdrop-blur-md border-b border-white/10" : "bg-transparent"
            )}
        >
            {/* Top Row: Logo, Search, Wallet - Constrained */}
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex justify-between items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
                        <img src="/logo-option5-advanced-10cuts.svg" alt="PolyBet logo" className="h-8 w-8" />
                        <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                            PolyBet
                        </span>
                    </Link>

                    <div className="flex-1 max-w-2xl">
                        <SearchBar onSearch={handleSearch} />
                    </div>

                    <div className="shrink-0 flex items-center gap-4">
                        {isConnected && (
                            <NotificationBell />
                        )}
                        {isConnected && address && (
                            <Link
                                href={`/user/${address}`}
                                className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold hover:opacity-90 transition-opacity shadow-lg border border-white/20 overflow-hidden"
                            >
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                )}
                            </Link>
                        )}
                        <ConnectButton />
                    </div>
                </div>
            </div>

            {/* Bottom Row: Categories - Full Width */}
            {onCategoryChange && (
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
            )}
        </motion.nav>
    );
}
