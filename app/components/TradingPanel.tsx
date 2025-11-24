'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';

interface TradingPanelProps {
    yesPrice: number;  // Actually the price/probability (0-1)
    noPrice: number;   // Actually the price/probability (0-1)
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (type: 'YES' | 'NO', amount: number) => void;
}

export function TradingPanel({ yesPrice, noPrice, creationDate, resolutionDate, onTrade }: TradingPanelProps) {
    const params = useParams();
    const eventId = params.id as string;

    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>('YES');
    const [amount, setAmount] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(false);
    const [lastTrade, setLastTrade] = useState<{ tokens: number, price: number } | null>(null);

    // Local state for real-time prices
    const [liveYesPrice, setLiveYesPrice] = useState(yesPrice);
    const [liveNoPrice, setLiveNoPrice] = useState(noPrice);

    // Update local state if props change (e.g. parent refetch)
    useEffect(() => {
        setLiveYesPrice(yesPrice);
        setLiveNoPrice(noPrice);
    }, [yesPrice, noPrice]);

    // Real-time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');

        function onOddsUpdate(update: any) {
            if (update.eventId !== eventId) return;
            setLiveYesPrice(update.yesPrice);
            setLiveNoPrice(1 - update.yesPrice);
        }

        socket.on(`odds-update-${eventId}`, onOddsUpdate);

        return () => {
            socket.off(`odds-update-${eventId}`, onOddsUpdate);
        };
    }, [eventId]);

    // Prices are probabilities (0-1), convert to percentages
    // Handle edge cases and ensure valid probabilities
    const safeYesPrice = Math.max(0, Math.min(1, liveYesPrice || 0.5));
    const safeNoPrice = Math.max(0, Math.min(1, liveNoPrice || 0.5));

    const yesProbability = Math.round(safeYesPrice * 100);
    const noProbability = Math.round(safeNoPrice * 100);

    // Calculate odds from prices (decimal odds = 1 / price)
    const yesOdds = liveYesPrice > 0 ? (1 / liveYesPrice) : 1;
    const noOdds = liveNoPrice > 0 ? (1 / liveNoPrice) : 1;

    // Calculate potential payout for current amount
    const currentAmount = parseFloat(amount) || 0;
    const potentialPayout = selectedOption === 'YES'
        ? currentAmount * yesOdds
        : currentAmount * noOdds;
    const potentialProfit = potentialPayout - currentAmount;

    const handleTrade = async () => {
        if (!amount || parseFloat(amount) <= 0) return;

        setIsLoading(true);
        try {
            const response = await fetch(`/api/events/${eventId}/bets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    outcome: selectedOption,
                    amount: parseFloat(amount),
                }),
            });

            if (!response.ok) {
                throw new Error('Trade failed');
            }

            const result = await response.json();
            setLastTrade({
                tokens: result.tokensReceived,
                price: result.priceAtTrade,
            });

            // Call the onTrade callback if provided
            if (onTrade) {
                onTrade(selectedOption, parseFloat(amount));
            }

            // Reset amount after successful trade
            setAmount('0');
        } catch (error) {
            console.error('Trade error:', error);
            // You could add error handling UI here
        } finally {
            setIsLoading(false);
        }
    };

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
                        <span className="text-xs opacity-80">{yesProbability}%</span>
                    </button>
                    <button
                        onClick={() => setSelectedOption('NO')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${selectedOption === 'NO'
                            ? 'bg-[#cf6679]/20 border-[#cf6679] text-[#cf6679]'
                            : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <span className="text-sm font-bold">No</span>
                        <span className="text-xs opacity-80">{noProbability}%</span>
                    </button>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                        <span>Amount</span>
                        <span className="text-white font-medium">${currentAmount.toFixed(2)}</span>
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

                    {/* Payout Display */}
                    {currentAmount > 0 && (
                        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-400">You will win:</span>
                                <span className="text-white font-bold">${potentialPayout.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                                <span>Profit:</span>
                                <span className={`font-medium ${potentialProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${potentialProfit.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        {['+1', '+20', '+100', 'Max'].map((val) => (
                            <button
                                key={val}
                                onClick={() => {
                                    if (val === 'Max') {
                                        setAmount('1000'); // Set a reasonable max
                                    } else {
                                        const increment = parseFloat(val.replace('+', ''));
                                        setAmount((parseFloat(amount) || 0 + increment).toString());
                                    }
                                }}
                                className="flex-1 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                            >
                                {val}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Trade Button */}
                <button
                    onClick={handleTrade}
                    disabled={isLoading || !amount || parseFloat(amount) <= 0}
                    className={`w-full py-3 rounded-lg font-bold text-black transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${selectedOption === 'YES'
                        ? 'bg-[#03dac6] hover:bg-[#02b3a5] shadow-[#03dac6]/20'
                        : 'bg-[#cf6679] hover:bg-[#b85868] shadow-[#cf6679]/20'
                        }`}
                >
                    {isLoading ? 'Processing...' : (selectedTab === 'buy' ? 'Buy' : 'Sell') + ' ' + selectedOption}
                </button>

                {/* Trade Success Feedback */}
                {lastTrade && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-center"
                    >
                        <p className="text-green-400 text-sm font-medium">
                            Trade successful! You bought {lastTrade.tokens.toFixed(2)} {selectedOption} tokens
                        </p>
                        <p className="text-green-300 text-xs mt-1">
                            If {selectedOption.toLowerCase()} wins, you'll receive ${(lastTrade.tokens * (selectedOption === 'YES' ? yesOdds : noOdds)).toFixed(2)} total
                        </p>
                    </motion.div>
                )}

                <p className="text-xs text-center text-gray-500">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>
        </div>
    );
}
