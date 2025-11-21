'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { SearchBar } from './SearchBar';

export function Navbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleSearch = (query: string) => {
        // Dispatch custom event for search
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
            <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center gap-4">
                <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 hover:opacity-80 transition-opacity shrink-0">
                    PolyBet
                </Link>

                {/* Search Bar */}
                <div className="flex-1 max-w-2xl">
                    <SearchBar onSearch={handleSearch} />
                </div>

                <div className="shrink-0">
                    <ConnectButton />
                </div>
            </div>
        </motion.nav>
    );
}
