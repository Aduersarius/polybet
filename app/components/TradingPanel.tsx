'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';

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
    // Mock user for dev
    const user = { id: 'dev-user' };
    const isLoaded = true;

    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>('YES');
    const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
    const [amount, setAmount] = useState<string>('0');
    const [price, setPrice] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(false);
    const [lastTrade, setLastTrade] = useState<{ tokens: number, price: number, orderType?: string, orderAmount?: number, orderPrice?: number, orderId?: string } | null>(null);

    // Local state for real-time prices
    const [liveYesPrice, setLiveYesPrice] = useState(yesPrice);
    const [liveNoPrice, setLiveNoPrice] = useState(noPrice);

    // Update local state if props change (e.g. parent refetch)
    useEffect(() => {
        setLiveYesPrice(yesPrice);
        setLiveNoPrice(noPrice);
        // Set default limit price to current market price
        if (orderType === 'limit' && selectedOption === 'YES') {
            setPrice(liveYesPrice.toFixed(2));
        } else if (orderType === 'limit' && selectedOption === 'NO') {
            setPrice(liveNoPrice.toFixed(2));
        }
    }, [yesPrice, noPrice, orderType, selectedOption, liveYesPrice, liveNoPrice]);


    // Real-time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');

        function onOddsUpdate(update: any) {
            if (update.eventId !== eventId) return;
            setLiveYesPrice(update.yesPrice);
            setLiveNoPrice(1 - update.yesPrice);
        }

        // Join event room for updates
        socket.emit('join-event', eventId);

        socket.on(`odds-update-${eventId}`, onOddsUpdate);

        return () => {
            socket.emit('leave-event', eventId);
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
    const currentPrice = orderType === 'limit' && price ? parseFloat(price) : (selectedOption === 'YES' ? liveYesPrice : liveNoPrice);
    const potentialPayout = currentAmount * (1 / currentPrice); // Odds = 1 / price
    const potentialProfit = potentialPayout - currentAmount;

    const tradeMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/hybrid-trading", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventId,
                    side: selectedTab,
                    option: selectedOption,
                    amount: parseFloat(amount),
                    price: orderType === 'limit' ? parseFloat(price) : undefined,
                    orderType,
                    // Removed hardcoded userId - let API use session auth
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

            // Reset amount after successful trade
            setAmount('0');
            if (orderType === 'limit') {
                setPrice('0');
            }

            // WebSocket will automatically update odds and order book in real-time
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
        if (!amount || parseFloat(amount) <= 0) return;
        setIsLoading(true);
        tradeMutation.mutate();
    };

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

            <div className="p-4 space-y-4">
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

                    {/* Order Type Selection */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>Order Type</span>
                            <span className="text-white font-medium">{orderType === 'market' ? 'Market' : 'Limit'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setOrderType('market')}
                                className={`py-2 px-3 text-sm font-medium rounded border transition-all ${orderType === 'market'
                                    ? 'bg-[#03dac6]/20 border-[#03dac6] text-[#03dac6]'
                                    : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                Market
                            </button>
                            <button
                                onClick={() => setOrderType('limit')}
                                className={`py-2 px-3 text-sm font-medium rounded border transition-all ${orderType === 'limit'
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
                                Current market price: ${(selectedOption === 'YES' ? liveYesPrice : liveNoPrice).toFixed(2)}
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
                        (orderType === 'limit' && (!price || parseFloat(price) <= 0 || parseFloat(price) >= 1))
                    }
                    className={`w-full py-3 rounded-lg font-bold text-black transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${selectedOption === 'YES'
                        ? 'bg-[#03dac6] hover:bg-[#02b3a5] shadow-[#03dac6]/20'
                        : 'bg-[#cf6679] hover:bg-[#b85868] shadow-[#cf6679]/20'
                        }`}
                >
                    {isLoading
                        ? 'Processing...'
                        : `${selectedTab === 'buy' ? 'Buy' : 'Sell'} ${selectedOption} ${orderType === 'market' ? '(Market)' : '(Limit)'}`
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
                                    Limit order placed! {selectedTab === 'buy' ? 'Buy' : 'Sell'} {lastTrade.orderAmount?.toFixed(2)} {selectedOption} tokens at ${(lastTrade.orderPrice! * 100).toFixed(2)}
                                </p>
                                <p className="text-green-300 text-xs mt-1">
                                    If filled and {selectedOption.toLowerCase()} wins, you'll receive ${(lastTrade.orderAmount! * (selectedOption === 'YES' ? (1 / lastTrade.orderPrice!) : (1 / lastTrade.orderPrice!))).toFixed(2)} total
                                </p>
                                <p className="text-green-300 text-xs">
                                    Order ID: {lastTrade.orderId}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-green-400 text-sm font-medium">
                                    Trade successful! You bought {lastTrade.tokens.toFixed(2)} {selectedOption} tokens
                                </p>
                                <p className="text-green-300 text-xs mt-1">
                                    If {selectedOption.toLowerCase()} wins, you'll receive ${(lastTrade.tokens * (selectedOption === 'YES' ? yesOdds : noOdds)).toFixed(2)} total
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
