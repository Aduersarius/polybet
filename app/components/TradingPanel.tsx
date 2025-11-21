'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TradingPanelProps {
    yesOdds: number;
    noOdds: number;
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (type: 'YES' | 'NO', amount: number) => void;
}

export function TradingPanel({ yesOdds, noOdds, creationDate, resolutionDate, onTrade }: TradingPanelProps) {
    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>('YES');
    const [amount, setAmount] = useState<string>('0');

    const yesPrice = (yesOdds / 100).toFixed(2);
    const noPrice = (noOdds / 100).toFixed(2);

    // Real-time countdown state
    const [countdown, setCountdown] = useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        isExpired: boolean;
    } | null>(null);

    // Calculate and update countdown every second
    useEffect(() => {
        if (!creationDate || !resolutionDate) return;

        const updateCountdown = () => {
            const now = Date.now();
            const resolution = new Date(resolutionDate).getTime();
            const remaining = Math.max(0, resolution - now);

            const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            setCountdown({ days, hours, minutes, seconds, isExpired: remaining <= 0 });
        };

        // Update immediately
        updateCountdown();

        // Update every second
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [creationDate, resolutionDate]);

    return (
        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Header Tabs */}
            <div className="flex border-b border-white/10">
                <button
                    onClick={() => setSelectedTab('buy')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors relative ${selectedTab === 'buy' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                        }`}
                >
                    Buy
                    {selectedTab === 'buy' && (
                        <motion.div
                            layoutId="activeTab"
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                        />
                    )}
                </button>
                <button
                    onClick={() => setSelectedTab('sell')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors relative ${selectedTab === 'sell' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                        }`}
                >
                    Sell
                    {selectedTab === 'sell' && (
                        <motion.div
                            layoutId="activeTab"
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                        />
                    )}
                </button>
            </div>

            {/* Countdown Timer */}
            {countdown && (
                <div className="px-4 py-3 bg-gradient-to-r from-gray-800/50 to-gray-900/50 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs text-gray-400 font-medium">Event Ends In</span>
                        </div>

                        {countdown.isExpired ? (
                            <span className="text-red-400 font-mono text-sm font-bold">ENDED</span>
                        ) : (
                            <div className="flex items-center gap-1 font-mono text-sm">
                                {countdown.days > 0 && (
                                    <span className="px-2 py-1 bg-gray-700 rounded text-green-400">
                                        {countdown.days}d
                                    </span>
                                )}
                                {(countdown.days > 0 || countdown.hours > 0) && (
                                    <span className="px-2 py-1 bg-gray-700 rounded text-green-400">
                                        {countdown.hours}h
                                    </span>
                                )}
                                <span className="px-2 py-1 bg-gray-700 rounded text-green-400">
                                    {countdown.minutes}m
                                </span>
                                <span className="px-2 py-1 bg-gray-700 rounded text-green-400 font-bold">
                                    {countdown.seconds}s
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="p-4 space-y-6">
                {/* Outcome Selector */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setSelectedOption('YES')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${selectedOption === 'YES'
                            ? 'bg-[#03dac6]/20 border-[#03dac6] text-[#03dac6]'
                            : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <span className="text-sm font-bold">Yes</span>
                        <span className="text-xs opacity-80">{yesPrice}¢</span>
                    </button>
                    <button
                        onClick={() => setSelectedOption('NO')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${selectedOption === 'NO'
                            ? 'bg-[#cf6679]/20 border-[#cf6679] text-[#cf6679]'
                            : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <span className="text-sm font-bold">No</span>
                        <span className="text-xs opacity-80">{noPrice}¢</span>
                    </button>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                        <span>Amount</span>
                        <span className="text-white font-medium">$0.00</span>
                    </div>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-8 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#bb86fc] transition-colors text-lg font-medium"
                            placeholder="0"
                        />
                    </div>
                    <div className="flex gap-2">
                        {['+1', '+20', '+100', 'Max'].map((val) => (
                            <button
                                key={val}
                                className="flex-1 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                            >
                                {val}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Trade Button */}
                <button
                    className={`w-full py-3 rounded-lg font-bold text-black transition-all shadow-lg ${selectedOption === 'YES'
                        ? 'bg-[#03dac6] hover:bg-[#02b3a5] shadow-[#03dac6]/20'
                        : 'bg-[#cf6679] hover:bg-[#b85868] shadow-[#cf6679]/20'
                        }`}
                >
                    {selectedTab === 'buy' ? 'Buy' : 'Sell'} {selectedOption}
                </button>

                <p className="text-xs text-center text-gray-500">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>
        </div>
    );
}
