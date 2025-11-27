'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { Plus, Wallet } from 'lucide-react';

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
    const [scrolled, setScrolled] = useState(false);

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

    return (
        <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
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
                        <button
                            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-sm font-medium transition-colors border border-green-500/20"
                        >
                            <Wallet className="w-4 h-4" />
                            Top Up
                        </button>

                        <NotificationBell />

                        {/* User Profile (Mock) */}
                        <Link href="/user/dev-user" className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            DV
                        </Link>
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
        </nav>
    );
}
