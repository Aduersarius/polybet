'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface SearchBarProps {
    onSearch?: (query: string) => void;
    placeholder?: string;
}

interface SearchResult {
    id: string;
    title: string;
    category: string;
    resolutionDate: string;
}

export function SearchBar({ onSearch, placeholder = "Search markets..." }: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchRef = useRef<HTMLDivElement>(null);

    // Debounced search
    useEffect(() => {
        const fetchResults = async () => {
            if (!query.trim()) {
                setResults([]);
                return;
            }

            setIsLoading(true);
            try {
                const response = await fetch(`/api/events/search?q=${encodeURIComponent(query)}`);
                const data = await response.json();
                setResults(data.events || []);
            } catch (error) {
                console.error('Search failed:', error);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        };

        const timeoutId = setTimeout(fetchResults, 300);
        return () => clearTimeout(timeoutId);
    }, [query]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearch = (value: string) => {
        setQuery(value);
        onSearch?.(value);
    };

    const handleResultClick = (eventId: string) => {
        router.push(`/event/${eventId}`);
        setQuery('');
        setResults([]);
        setIsFocused(false);
    };

    const getTimeRemaining = (date: string) => {
        const now = new Date();
        const end = new Date(date);
        const diff = end.getTime() - now.getTime();
        if (diff <= 0) return "Ended";
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days > 0) return `${days}d`;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        return `${hours}h`;
    };

    return (
        <div ref={searchRef} className="relative w-full">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative flex items-center transition-all duration-300 ${isFocused ? 'scale-105' : ''
                    }`}
            >
                {/* Search Icon */}
                <div className="absolute left-3 pointer-events-none">
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-[#bb86fc] border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg
                            className={`w-5 h-5 transition-colors ${isFocused ? 'text-[#bb86fc]' : 'text-gray-400'
                                }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                    )}
                </div>

                {/* Input */}
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    placeholder={placeholder}
                    className={`w-full pl-10 pr-10 py-2 bg-[#1e1e1e]/80 backdrop-blur-sm border rounded-lg text-white placeholder-gray-400 focus:outline-none transition-all ${isFocused
                        ? 'border-[#bb86fc] shadow-lg shadow-[#bb86fc]/20'
                        : 'border-[#333] hover:border-[#555]'
                        }`}
                />

                {/* Clear Button */}
                <AnimatePresence>
                    {query && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => handleSearch('')}
                            className="absolute right-3 text-gray-400 hover:text-white transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </motion.button>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Results Dropdown */}
            <AnimatePresence>
                {isFocused && query && results.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full mt-2 w-full bg-[#1e1e1e] border border-[#333] rounded-lg shadow-xl shadow-black/50 overflow-hidden z-50"
                    >
                        <div className="max-h-96 overflow-y-auto">
                            {results.map((result) => (
                                <button
                                    key={result.id}
                                    onClick={() => handleResultClick(result.id)}
                                    className="w-full px-4 py-3 text-left hover:bg-[#2c2c2c] transition-colors border-b border-[#333] last:border-b-0 group"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white group-hover:text-[#bb86fc] transition-colors line-clamp-1">
                                                {result.title}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-xs px-2 py-0.5 rounded ${result.category === 'CRYPTO' ? 'bg-orange-500/20 text-orange-500' :
                                                    result.category === 'SPORTS' ? 'bg-blue-500/20 text-blue-500' :
                                                        result.category === 'POLITICS' ? 'bg-red-500/20 text-red-500' :
                                                            'bg-purple-500/20 text-purple-500'
                                                    }`}>
                                                    {result.category}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {getTimeRemaining(result.resolutionDate)}
                                                </span>
                                            </div>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-500 group-hover:text-[#bb86fc] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* No Results Message */}
            <AnimatePresence>
                {isFocused && query && !isLoading && results.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full mt-2 w-full bg-[#1e1e1e] border border-[#333] rounded-lg shadow-xl shadow-black/50 px-4 py-3 z-50"
                    >
                        <p className="text-sm text-gray-400 text-center">No events found</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
