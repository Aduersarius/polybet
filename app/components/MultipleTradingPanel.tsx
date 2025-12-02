'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';

interface Outcome {
    id: string;
    name: string;
    probability: number;
    price: number;
    odds: number;
    color?: string;
}

interface MultipleTradingPanelProps {
    outcomes: Outcome[];
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (outcomeId: string, amount: number) => void;
    onTradeSuccess?: () => void;
}

export function MultipleTradingPanel({ outcomes, creationDate, resolutionDate, onTrade, onTradeSuccess }: MultipleTradingPanelProps) {
    const params = useParams();
    const eventId = params.id as string;
    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(outcomes[0]?.id || '');
    const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
    const [amount, setAmount] = useState<string>('0');
    const [price, setPrice] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(false);
    const [lastTrade, setLastTrade] = useState<{ tokens: number, price: number, orderType?: string, orderAmount?: number, orderPrice?: number, orderId?: string } | null>(null);

    // Risk management: maximum bet amount
    const MAX_BET_AMOUNT = 10000; // $10,000 max bet

    const selectedOutcome = outcomes.find(o => o.id === selectedOutcomeId);

    // Update selected outcome when outcomes change
    useEffect(() => {
        if (outcomes.length > 0 && !outcomes.find(o => o.id === selectedOutcomeId)) {
            setSelectedOutcomeId(outcomes[0].id);
        }
    }, [outcomes, selectedOutcomeId]);

    // Update price when outcome changes
    useEffect(() => {
        if (selectedOutcome && orderType === 'limit') {
            setPrice(selectedOutcome.price.toFixed(2));
        }
    }, [selectedOutcome, orderType]);

    const currentAmount = parseFloat(amount) || 0;
    const currentPrice = orderType === 'limit' && price ? parseFloat(price) : (selectedOutcome?.price || 0);
    const potentialPayout = currentAmount * (1 / currentPrice);
    const potentialProfit = potentialPayout - currentAmount;

    const tradeMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/hybrid-trading", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventId,
                    side: selectedTab,
                    outcomeId: selectedOutcomeId,
                    amount: parseFloat(amount),
                    price: orderType === 'limit' ? parseFloat(price) : undefined,
                    orderType,
                    userId: "dev-user",
                }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Trade failed');
            }

            const result = await res.json();
            setLastTrade({
                tokens: result.totalFilled,
                price: result.averagePrice,
                orderType: result.orderType,
                orderAmount: result.amount,
                orderPrice: result.price,
                orderId: result.orderId
            });

            setAmount('0');
            if (orderType === 'limit') {
                setPrice('0');
            }

            // Notify parent component to refetch data
            if (onTradeSuccess) {
                onTradeSuccess();
            }
        },
        onError: (error) => {
            console.error('Trade error:', error);
            alert(error instanceof Error ? error.message : 'Failed to place trade');
        },
        onSettled: () => {
            setIsLoading(false);
        }
    });

    const handleTrade = () => {
        if (!amount || parseFloat(amount) <= 0 || !selectedOutcomeId) return;
        setIsLoading(true);
        tradeMutation.mutate();
    };

    // Real-time countdown
    const [countdown, setCountdown] = useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        isExpired: boolean;
    } | null>(null);

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

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [creationDate, resolutionDate]);

    return (
        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Header Tabs */}
            <div className="flex border-b border-white/10">
                <button
                    onClick={() => setSelectedTab('buy')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors relative ${selectedTab === 'buy' ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    Buy
                    {selectedTab === 'buy' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                    )}
                </button>
                <button
                    onClick={() => setSelectedTab('sell')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors relative ${selectedTab === 'sell' ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    Sell
                    {selectedTab === 'sell' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
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

            <div className="p-4 space-y-4">
                {/* Outcome Selector */}
                <div className="space-y-2">
                    <div className="text-sm text-gray-400">Select Outcome</div>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                        {outcomes.map((outcome) => (
                            <button
                                key={outcome.id}
                                onClick={() => setSelectedOutcomeId(outcome.id)}
                                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                    selectedOutcomeId === outcome.id
                                        ? 'bg-[#bb86fc]/20 border-[#bb86fc] text-[#bb86fc]'
                                        : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    {outcome.color && (
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: outcome.color }}
                                        />
                                    )}
                                    <span className="font-medium">{outcome.name}</span>
                                </div>
                                <span className="text-xs opacity-80">{Math.round(outcome.probability * 100)}%</span>
                            </button>
                        ))}
                    </div>
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
                    {currentAmount > 0 && selectedOutcome && (
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
                                        setAmount('1000');
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

                    {/* Order Type Selection */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>Order Type</span>
                            <span className="text-white font-medium">{orderType === 'market' ? 'Market' : 'Limit'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setOrderType('market')}
                                className={`py-2 px-3 text-sm font-medium rounded border transition-all ${
                                    orderType === 'market'
                                        ? 'bg-[#03dac6]/20 border-[#03dac6] text-[#03dac6]'
                                        : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                Market
                            </button>
                            <button
                                onClick={() => setOrderType('limit')}
                                className={`py-2 px-3 text-sm font-medium rounded border transition-all ${
                                    orderType === 'limit'
                                        ? 'bg-[#cf6679]/20 border-[#cf6679] text-[#cf6679]'
                                        : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                Limit
                            </button>
                        </div>
                    </div>

                    {/* Limit Price Input */}
                    {orderType === 'limit' && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-gray-400">
                                <span>Limit Price</span>
                                <span className="text-white font-medium">${(parseFloat(price) * 100).toFixed(2)}</span>
                            </div>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-8 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#bb86fc] transition-colors text-lg font-medium"
                                    placeholder="0.50"
                                    step="0.01"
                                    min="0.01"
                                    max="0.99"
                                />
                            </div>
                            <div className="text-xs text-gray-500">
                                Current market price: ${(selectedOutcome?.price.toFixed(2) || '0.00')}
                            </div>
                        </div>
                    )}
                </div>

                {/* Trade Button */}
                <button
                    onClick={handleTrade}
                    disabled={
                        isLoading ||
                        !amount ||
                        parseFloat(amount) <= 0 ||
                        parseFloat(amount) > MAX_BET_AMOUNT ||
                        !selectedOutcomeId ||
                        (orderType === 'limit' && (!price || parseFloat(price) <= 0 || parseFloat(price) >= 1))
                    }
                    className="w-full py-3 rounded-lg font-bold text-black transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={selectedOutcome?.color ? {
                        backgroundColor: selectedOutcome.color,
                        boxShadow: `0 0 20px ${selectedOutcome.color}40`
                    } : {
                        backgroundColor: '#bb86fc',
                        boxShadow: '0 0 20px rgba(187, 134, 252, 0.2)'
                    }}
                >
                    {isLoading
                        ? 'Processing...'
                        : parseFloat(amount) > MAX_BET_AMOUNT
                            ? `Max bet: $${MAX_BET_AMOUNT.toLocaleString()}`
                            : `${selectedTab === 'buy' ? 'Buy' : 'Sell'} ${selectedOutcome?.name || 'Outcome'} ${orderType === 'market' ? '(Market)' : '(Limit)'}`
                    }
                </button>

                {/* Trade Success Feedback */}
                {lastTrade && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-center"
                    >
                        {lastTrade.orderType === 'limit' ? (
                            <>
                                <p className="text-green-400 text-sm font-medium">
                                    Limit order placed! {selectedTab === 'buy' ? 'Buy' : 'Sell'} {lastTrade.orderAmount?.toFixed(2)} {selectedOutcome?.name} tokens at ${(lastTrade.orderPrice! * 100).toFixed(2)}
                                </p>
                                <p className="text-green-300 text-xs mt-1">
                                    If {selectedOutcome?.name} wins, you'll receive ${(lastTrade.orderAmount! * (selectedOutcome ? 1 / lastTrade.orderPrice! : 1)).toFixed(2)} total
                                </p>
                                <p className="text-green-300 text-xs">
                                    Order ID: {lastTrade.orderId}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-green-400 text-sm font-medium">
                                    Trade successful! You bought {lastTrade.tokens.toFixed(2)} {selectedOutcome?.name} tokens
                                </p>
                                <p className="text-green-300 text-xs mt-1">
                                    If {selectedOutcome?.name} wins, you'll receive ${(lastTrade.tokens * (selectedOutcome ? selectedOutcome.odds : 1)).toFixed(2)} total
                                </p>
                            </>
                        )}
                    </motion.div>
                )}

                <p className="text-xs text-center text-gray-500">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>
        </div>
    );
}