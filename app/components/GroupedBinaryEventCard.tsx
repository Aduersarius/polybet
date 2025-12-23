'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCategoryColorClasses, getCategoryColor, muteColor, darkenColor } from '@/lib/colors';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface DbEvent {
    id: string;
    title: string;
    description: string;
    category: string;
    categories?: string[];
    resolutionDate: string;
    createdAt: string;
    imageUrl?: string | null;
    volume?: number;
    betCount?: number;
    type?: string;
    outcomes?: Array<{
        id: string;
        name: string;
        probability: number;
        color?: string;
    }>;
}

interface GroupedBinaryEventCardProps {
    event: DbEvent;
    isEnded?: boolean;
    onSubBetTrade?: (event: DbEvent, outcomeId: string, outcomeName: string, option: 'YES' | 'NO') => void;
    onCategoryClick?: (category: string) => void;
    index?: number;
}

const getTimeRemaining = (endDate: Date) => {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 365) return `${Math.floor(days / 365)}y`;
    if (days > 30) return `${Math.floor(days / 30)}mo`;
    if (days > 0) return `${days}d`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return `${hours}h`;
};

const getFullTimeRemaining = (endDate: Date) => {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    if (diff <= 0) return "ENDED";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (days > 0 || hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
};

export function GroupedBinaryEventCard({
    event,
    isEnded = false,
    onSubBetTrade,
    onCategoryClick,
    index = 0,
}: GroupedBinaryEventCardProps) {
    const queryClient = useQueryClient();
    const [showBuyInterface, setShowBuyInterface] = useState(false);
    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);
    const [selectedOutcomeName, setSelectedOutcomeName] = useState<string>('');
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>('YES');
    const [buyAmount, setBuyAmount] = useState<string>('10');
    const [userBalance, setUserBalance] = useState<number>(0);
    const [balancePct, setBalancePct] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);

    // Countdown state (EventCard2 copy)
    const [isCountdownHovered, setIsCountdownHovered] = useState(false);
    const [countdownWidth, setCountdownWidth] = useState<number | 'auto'>('auto');
    const [fullTimeRemaining, setFullTimeRemaining] = useState('');
    const countdownShortRef = useRef<HTMLSpanElement>(null);
    const countdownFullRef = useRef<HTMLSpanElement>(null);

    const amountNum = parseFloat(buyAmount) || 0;

    // Fetch user balance
    const { data: balanceData } = useQuery({
        queryKey: ['user-balance'],
        queryFn: async () => {
            const response = await fetch('/api/balance');
            if (!response.ok) return { balance: 0 };
            return await response.json();
        },
        enabled: showBuyInterface,
        staleTime: 10000,
    });

    useEffect(() => {
        if (balanceData?.balance !== undefined) {
            const balance = typeof balanceData.balance === 'number'
                ? balanceData.balance
                : parseFloat(balanceData.balance) || 0;
            setUserBalance(balance);
        }
    }, [balanceData]);

    const handleSubBetClick = (e: React.MouseEvent, outcomeId: string, outcomeName: string, option: 'YES' | 'NO') => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOutcomeId(outcomeId);
        setSelectedOutcomeName(outcomeName);
        setSelectedOption(option);
        setShowBuyInterface(true);
    };

    const handleCloseBuy = () => setShowBuyInterface(false);

    const handleAmountChange = (value: string) => {
        if (value === '') {
            setBuyAmount('');
            setBalancePct(0);
            return;
        }
        const regex = /^\d*\.?\d{0,2}$/;
        if (regex.test(value)) {
            setBuyAmount(value);
            const num = parseFloat(value);
            if (!isNaN(num) && userBalance > 0) {
                setBalancePct(Math.min(100, Math.max(0, (num / userBalance) * 100)));
            }
        }
    };

    const incrementAmount = (val: number) => {
        const current = parseFloat(buyAmount) || 0;
        const newVal = current + val;
        handleAmountChange(newVal.toString());
    };

    const setMaxAmount = () => {
        handleAmountChange(userBalance.toString());
    };

    const handleBuy = async () => {
        if (!selectedOutcomeId || amountNum <= 0) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: event.id,
                    outcomeId: selectedOutcomeId,
                    side: selectedOption,
                    amount: amountNum
                })
            });

            if (!res.ok) throw new Error('Trade failed');

            toast({
                title: "Trade Submitted",
                description: `Bought $${amountNum} of ${selectedOption} on ${selectedOutcomeName}`,
                variant: "default",
                className: "bg-emerald-500 border-none text-white",
            });
            setShowBuyInterface(false);
            queryClient.invalidateQueries({ queryKey: ['user-balance'] });
            queryClient.invalidateQueries({ queryKey: ['user-positions'] });
        } catch (err) {
            toast({
                title: "Error",
                description: "Failed to place trade",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch user's favorites
    const { data: userFavorites, refetch: refetchFavorites } = useQuery({
        queryKey: ['user-favorites'],
        queryFn: async () => {
            const res = await fetch('/api/user/favorites');
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || [];
        },
    });

    // Derive isFavorite from query data (avoids setState in useEffect)
    const isFavorite = userFavorites?.some((fav: any) => fav.id === event.id) ?? false;

    const toggleFavorite = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            if (isFavorite) {
                const res = await fetch(`/api/user/favorites?eventId=${event.id}`, { method: 'DELETE' });
                if (res.ok) {
                    refetchFavorites();
                    queryClient.invalidateQueries({ queryKey: ['favorite-events'] });
                }
            } else {
                const res = await fetch('/api/user/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: event.id }),
                });
                if (res.ok) {
                    refetchFavorites();
                    queryClient.invalidateQueries({ queryKey: ['favorite-events'] });
                }
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };



    // Format volume
    const volume = event.volume
        ? event.volume >= 1000000
            ? `$${(event.volume / 1000000).toFixed(1)}m`
            : event.volume >= 1000
                ? `$${(event.volume / 1000).toFixed(1)}k`
                : `$${Math.round(event.volume)}`
        : '$0';

    const outcomes = event.outcomes || [];
    const endDate = new Date(event.resolutionDate);
    const timeRemaining = getTimeRemaining(endDate);
    const primaryCategory = event.categories?.[0] || event.category || 'General';
    // Use getCategoryColor for consistent styling


    // Dynamic countdown width calculation (EventCard2 logic)
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCountdownHovered) {
            setFullTimeRemaining(getFullTimeRemaining(endDate));
            interval = setInterval(() => {
                setFullTimeRemaining(getFullTimeRemaining(endDate));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isCountdownHovered, endDate]);

    useLayoutEffect(() => {
        if (countdownShortRef.current && countdownFullRef.current) {
            const shortWidth = countdownShortRef.current.offsetWidth;
            const fullWidth = countdownFullRef.current.offsetWidth; // + extra padding if needed?
            // EventCard2 uses exact widths. 
            // We set width based on hover state
            if (isCountdownHovered) {
                setCountdownWidth(fullWidth);
            } else {
                setCountdownWidth(shortWidth);
            }
        }
    }, [isCountdownHovered, timeRemaining, fullTimeRemaining]);

    // Derived values for overlay


    const currentPrice = 0.5; // Placeholder or fetch real price if available locally
    // If we assume 50/50 for now or use outcome probability
    const selectedOutcomeProb = outcomes.find(o => o.id === selectedOutcomeId)?.probability ?? 50;
    const effectivePrice = selectedOption === 'YES' ? (selectedOutcomeProb > 1 ? selectedOutcomeProb / 100 : selectedOutcomeProb) : (1 - (selectedOutcomeProb > 1 ? selectedOutcomeProb / 100 : selectedOutcomeProb));
    const winAmount = amountNum / (effectivePrice || 0.5);
    const returnPct = ((winAmount - amountNum) / amountNum) * 100;
    const buyButtonColor = selectedOption === 'YES' ? '#0E9070' : '#D14444';

    // Hex colors matching button colors
    const greenHex = '#0E9070';
    const redHex = '#D14444';



    return (
        <div className="relative w-full pt-2 pb-6 -mb-6" style={{ overflowX: 'hidden' }}>
            <motion.div
                initial={{ opacity: 0, y: 20, x: '0%' }}
                animate={{
                    opacity: 1,
                    y: 0,
                    x: showBuyInterface ? '-50%' : '0%',
                }}
                transition={{
                    opacity: { duration: 0.4, delay: index * 0.08, ease: "easeOut" },
                    y: { duration: 0.4, delay: index * 0.08, ease: "easeOut" },
                    x: { type: 'spring', damping: 30, stiffness: 500, duration: 0.3 }
                }}
                className="relative flex w-[200%]"
                style={{
                    willChange: 'transform',
                    transform: 'translateZ(0)'
                }}
            >
                {/* Normal Card View */}
                <Link
                    key={event.id}
                    href={`/event/${event.id}`}
                    className="w-1/2 flex-shrink-0"
                    style={{ overflow: 'visible' }}
                >
                    <motion.div
                        whileHover={{ y: -2 }}
                        transition={{ duration: 0.2, delay: 0, ease: "easeOut" }}
                        style={{ backgroundColor: 'var(--surface)', overflow: 'visible' }}
                        className={`group border border-blue-400/10 hover:border-blue-400/30 rounded-2xl px-4 pt-4 pb-4 transition-colors transition-shadow duration-300 flex flex-col justify-between h-[220px] w-full gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_32px_rgba(59,130,246,0.15)] ${isEnded ? 'opacity-50' : ''}`}
                    >
                        {/* 1. Header: Image & Title */}
                        <div className="flex items-start gap-2.5">
                            <div className="flex-shrink-0 relative">
                                {event.imageUrl ? (
                                    <img
                                        src={event.imageUrl}
                                        alt={event.title}
                                        className="w-12 h-12 rounded-lg object-cover border border-blue-400/20 group-hover:border-blue-400/40 transition-all duration-300 shadow-md"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 flex items-center justify-center text-sm font-bold text-blue-300 transition-all duration-300 shadow-inner">
                                        <span className="text-lg">🎯</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                    <h3 className="text-[13px] font-bold text-white leading-tight line-clamp-3 group-hover:text-blue-100 transition-all duration-300">
                                        {event.title}
                                    </h3>
                                    <button
                                        onClick={toggleFavorite}
                                        className="flex-shrink-0 text-gray-500 hover:text-pink-400 transition-all duration-300 pt-0.5 hover:scale-110"
                                    >
                                        <svg
                                            className={`w-4 h-4 ${isFavorite ? 'fill-pink-500 text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]' : 'text-gray-500'}`}
                                            fill={isFavorite ? 'currentColor' : 'none'}
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 2. Info Row: Categories & Time */}
                        <div className="flex items-center justify-between relative" style={{ overflowX: 'visible', overflowY: 'visible', minHeight: '28px' }}>
                            <motion.div
                                className="flex items-center gap-2 flex-nowrap flex-1 -ml-1"
                                animate={{ opacity: isCountdownHovered ? 0 : 1 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                style={{ pointerEvents: isCountdownHovered ? 'none' : 'auto' }}
                            >
                                {event.categories && event.categories.length > 0 ? (
                                    event.categories.slice(0, 2).map((cat, idx) => {
                                        const colorObj = getCategoryColor(cat) as { text: string; border: string; bg: string };
                                        return (
                                            <div
                                                key={idx}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCategoryClick?.(cat); }}
                                                style={{ color: colorObj.text, borderColor: colorObj.border, backgroundColor: colorObj.bg }}
                                                className="inline-flex items-center rounded-full border text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold cursor-pointer hover:scale-105 transition-transform duration-200"
                                            >
                                                {cat}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCategoryClick?.(primaryCategory); }}
                                        style={{ color: getCategoryColor(primaryCategory).text, borderColor: getCategoryColor(primaryCategory).border, backgroundColor: getCategoryColor(primaryCategory).bg }}
                                        className="inline-flex items-center rounded-full border text-[10px] h-5 px-2 py-0 uppercase tracking-wide font-bold cursor-pointer hover:scale-105 transition-transform duration-200"
                                    >
                                        {primaryCategory}
                                    </div>
                                )}
                            </motion.div>

                            {/* Countdown Timer */}
                            <div
                                className="absolute right-0 z-10 flex items-center"
                                style={{ top: 0, bottom: 0 }}
                                onMouseEnter={() => setIsCountdownHovered(true)}
                                onMouseLeave={() => setIsCountdownHovered(false)}
                            >
                                <div className="absolute opacity-0 pointer-events-none" style={{ visibility: 'hidden' }}>
                                    <span ref={countdownShortRef} className="text-[10px] font-mono font-bold px-2 py-0 h-5 whitespace-nowrap inline-flex items-center">{timeRemaining}</span>
                                    <span ref={countdownFullRef} className="text-[10px] font-mono font-bold px-2 py-0 h-5 whitespace-nowrap inline-flex items-center">{fullTimeRemaining || getFullTimeRemaining(endDate)}</span>
                                </div>

                                <motion.div
                                    className="text-[10px] font-mono font-bold text-blue-300 bg-blue-500/10 px-2 py-0 h-5 rounded-lg border border-blue-400/20 shadow-inner cursor-pointer whitespace-nowrap overflow-hidden inline-flex items-center"
                                    style={{ lineHeight: 'normal' }}
                                    animate={{ width: countdownWidth === 'auto' ? 'auto' : `${countdownWidth}px` }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                >
                                    <AnimatePresence mode="wait">
                                        {!isCountdownHovered ? (
                                            <motion.span
                                                key="short"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.15, ease: "easeOut" }}
                                                className="inline-block"
                                            >
                                                {timeRemaining}
                                            </motion.span>
                                        ) : (
                                            <motion.span
                                                key="full"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.15, ease: "easeOut" }}
                                                className="inline-block whitespace-nowrap"
                                            >
                                                {fullTimeRemaining}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            </div>
                        </div>

                        {/* 4. Body: Grouped Binary Outcomes List */}
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent -mx-2 px-2 space-y-2 mt-1 mb-1">
                            {outcomes.map((outcome, idx) => {
                                const probability = outcome.probability ?? 0;
                                const percentage = probability > 1 ? probability : Math.round(probability * 100);

                                return (
                                    <div key={outcome.id || idx} className="flex items-center gap-2">
                                        {/* Outcome Name */}
                                        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                            <span className="text-gray-300 text-xs font-medium truncate group-hover/card:text-white transition-colors">
                                                {outcome.name}
                                            </span>
                                            <span className="text-gray-400 text-xs font-bold whitespace-nowrap">
                                                {percentage}%
                                            </span>
                                        </div>

                                        {/* Buttons Container */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <motion.button
                                                whileHover="hover"
                                                initial="initial"
                                                onClick={(e) => handleSubBetClick(e, outcome.id, outcome.name, 'YES')}
                                                className="relative w-12 h-7 rounded-lg font-bold text-xs overflow-hidden shadow-sm hover:shadow-md transition-all border border-emerald-500/30 group/btn"
                                                style={{ backgroundColor: greenHex }}
                                            >
                                                <span className="absolute inset-0 flex items-center justify-center text-white transition-opacity duration-200 group-hover/btn:opacity-0">Yes</span>
                                                <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity duration-200 group-hover/btn:opacity-100">{percentage}%</span>
                                            </motion.button>

                                            <motion.button
                                                whileHover="hover"
                                                initial="initial"
                                                onClick={(e) => handleSubBetClick(e, outcome.id, outcome.name, 'NO')}
                                                className="relative w-12 h-7 rounded-lg font-bold text-xs overflow-hidden shadow-sm hover:shadow-md transition-all border border-red-500/30 group/btn"
                                                style={{ backgroundColor: redHex }}
                                            >
                                                <span className="absolute inset-0 flex items-center justify-center text-white transition-opacity duration-200 group-hover/btn:opacity-0">No</span>
                                                <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity duration-200 group-hover/btn:opacity-100">{100 - percentage}%</span>
                                            </motion.button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 5. Footer: Volume + Comment Count */}
                        <div className="pt-2 border-t border-blue-400/10 flex items-center justify-between shrink-0 h-7 overflow-visible">
                            <span className="text-gray-500 text-[10px] font-medium">
                                {volume} Vol.
                            </span>
                            <div className="flex items-center gap-1 text-gray-500">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span className="text-[10px] font-medium is-num">0</span>
                            </div>
                        </div>
                    </motion.div>
                </Link>

                {/* Buy Interface - EventCard2 Style */}
                <div className="w-1/2 flex-shrink-0">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: showBuyInterface ? 1 : 0 }}
                        style={{ backgroundColor: 'var(--surface)' }}
                        className="border border-blue-400/10 hover:border-blue-400/30 rounded-2xl px-4 pt-3 pb-3 h-[220px] w-full flex flex-col gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_32px_rgba(59,130,246,0.15)] transition-all duration-300 relative overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCloseBuy();
                            }}
                            className="absolute top-3 right-4 z-10 w-5 h-5 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        {/* Header - Compact */}
                        <div className="flex items-center gap-2 flex-shrink-0 pr-8">
                            {event.imageUrl ? (
                                <img
                                    src={event.imageUrl}
                                    alt={event.title}
                                    className="w-8 h-8 rounded-lg object-cover border border-blue-400/20 flex-shrink-0"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                                    <span className="text-lg">🎯</span>
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold text-white leading-tight line-clamp-2">
                                    {selectedOutcomeName}
                                </p>
                            </div>
                        </div>

                        {/* Amount Input - Compact */}
                        <div className="flex-shrink-0">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                <input
                                    type="text"
                                    value={buyAmount}
                                    onChange={(e) => handleAmountChange(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-6 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors text-sm font-medium"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Preset buttons - Compact */}
                        <div className="grid grid-cols-4 gap-1.5 flex-shrink-0">
                            {[1, 10, 100].map((val) => (
                                <button
                                    key={val}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); incrementAmount(val); }}
                                    className="h-7 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center"
                                >
                                    +{val}
                                </button>
                            ))}
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMaxAmount(); }}
                                className="h-7 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center"
                            >
                                MAX
                            </button>
                        </div>

                        {/* Balance Slider - Compact */}
                        <div className="flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Slider
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={[balancePct]}
                                    className="flex-1 h-1"
                                    disabled={userBalance <= 0}
                                    onValueChange={(vals) => {
                                        const pct = vals?.[0] ?? 0;
                                        setBalancePct(pct);
                                        if (userBalance > 0) {
                                            const nextAmount = userBalance * (pct / 100);
                                            setBuyAmount(nextAmount > 0 ? nextAmount.toFixed(2) : '');
                                        }
                                    }}
                                />
                                <span className="w-8 text-right text-[10px] text-gray-400 whitespace-nowrap">
                                    {balancePct.toFixed(0)}%
                                </span>
                            </div>
                        </div>

                        {/* Buy Button */}
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBuy(); }}
                            disabled={isLoading || amountNum <= 0}
                            className="flex-1 min-h-[48px] disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5"
                            style={{ backgroundColor: buyButtonColor }}
                            onMouseEnter={(e) => {
                                if (!isLoading && amountNum > 0) {
                                    e.currentTarget.style.backgroundColor = darkenColor(buyButtonColor, 0.1);
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isLoading && amountNum > 0) {
                                    e.currentTarget.style.backgroundColor = buyButtonColor;
                                }
                            }}
                        >
                            <span className="text-sm font-bold">Buy {selectedOption}</span>
                            <span className="text-[11px] font-normal text-white/90">
                                To win ${winAmount.toFixed(2)}
                            </span>
                        </button>

                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
