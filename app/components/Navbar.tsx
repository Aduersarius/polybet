'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { SearchBar } from './SearchBar';

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
                    <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 hover:opacity-80 transition-opacity shrink-0">
                        PolyBet
                    </Link>

                    <div className="flex-1 max-w-2xl">
                        <SearchBar onSearch={handleSearch} />
                    </div>

                    <div className="shrink-0">
                        <ConnectButton />
                    </div>
                </div>
            </div>

            {/* Bottom Row: Categories - Full Width */}
            {onCategoryChange && (
                <div className="w-full bg-black/30 backdrop-blur-sm border-t border-white/5">
                    <div className="max-w-7xl mx-auto px-4 py-2">
                        <div className="overflow-x-auto scrollbar-hide">
                            <div className="flex gap-2 min-w-max justify-center">
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
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </motion.nav>
    );
}
