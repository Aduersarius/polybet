'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { calculateLMSROdds } from '@/lib/amm';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Search, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Info, AlertCircle } from 'lucide-react';

interface Outcome {
    id: string;
    name: string;
    probability: number;
    color?: string;
    liquidity?: number;
    qNo?: number;
}

interface GroupedBinaryTradingPanelProps {
    eventId: string;
    outcomes: Outcome[];
    liveOutcomes?: Outcome[];
    onTradeSuccess?: () => void;
    onTrade?: () => void; // Alias for onTradeSuccess
    creationDate?: string;
    resolutionDate?: string;
    selectedOutcomeId?: string | null;
    onOutcomeChange?: (id: string) => void;
    tradeIntent?: {
        side: 'buy' | 'sell';
        price: number;
        amount: number;
        outcomeId?: string;
    } | null;
}

export function GroupedBinaryTradingPanel({
    eventId,
    outcomes,
    liveOutcomes: propsLiveOutcomes,
    onTradeSuccess,
    onTrade,
    creationDate,
    resolutionDate,
    selectedOutcomeId: externalOutcomeId,
    onOutcomeChange,
    tradeIntent,
}: GroupedBinaryTradingPanelProps) {
    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>('YES');
    const [internalOutcomeId, setInternalOutcomeId] = useState<string | null>(null);
    const selectedOutcomeId = externalOutcomeId || internalOutcomeId;
    const setSelectedOutcomeId = onOutcomeChange || setInternalOutcomeId;

    const [amount, setAmount] = useState<string>('10');
    const [price, setPrice] = useState<string>('0');
    const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
    const [searchQuery, setSearchQuery] = useState('');
    const [hotOutcomes, setHotOutcomes] = useState<Outcome[]>([]);

    const queryClient = useQueryClient();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Initial outcome selection
    useEffect(() => {
        if (!selectedOutcomeId && outcomes.length > 0) {
            setSelectedOutcomeId(outcomes[0].id);
        }
    }, [outcomes, selectedOutcomeId]);

    // WebSocket listener for real-time updates
    useEffect(() => {
        const { socket } = require('@/lib/socket');

        function onOddsUpdate(update: any) {
            if (update.eventId !== eventId) return;

            if (update.outcomes) {
                setHotOutcomes(update.outcomes);
            }
        }

        socket.on(`odds-update-${eventId}`, onOddsUpdate);
        return () => {
            socket.off(`odds-update-${eventId}`, onOddsUpdate);
        };
    }, [eventId]);

    // Effectively used outcomes (prefer WebSocket data)
    const effectiveOutcomes = useMemo(() => {
        const base = propsLiveOutcomes || outcomes || [];
        if (hotOutcomes.length === 0) return base;

        return base.map(b => {
            const hot = hotOutcomes.find(h => h.id === b.id);
            return hot ? { ...b, ...hot } : b;
        });
    }, [propsLiveOutcomes, outcomes, hotOutcomes]);

    const selectedOutcome = useMemo(() =>
        effectiveOutcomes.find(o => o.id === selectedOutcomeId),
        [effectiveOutcomes, selectedOutcomeId]);

    // Filtered outcomes for the list
    const filteredOutcomes = useMemo(() => {
        if (!searchQuery.trim()) return effectiveOutcomes;
        return effectiveOutcomes.filter(o =>
            o.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [effectiveOutcomes, searchQuery]);

    // Scroll selected outcome into view
    useEffect(() => {
        if (selectedOutcomeId && scrollContainerRef.current) {
            const index = filteredOutcomes.findIndex(o => o.id === selectedOutcomeId);
            if (index >= 0) {
                const container = scrollContainerRef.current;
                const item = container.children[index] as HTMLElement;
                if (item) {
                    item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        }
    }, [selectedOutcomeId, filteredOutcomes]);

    // Fetch user balance
    const { data: balanceData } = useQuery({
        queryKey: ['user-balances'],
        queryFn: async () => {
            const res = await fetch('/api/user/balances');
            if (!res.ok) return [];
            const json = await res.json();
            return json.balances || [];
        },
        staleTime: 5000,
    });

    const currentBalance = useMemo(() => {
        if (!balanceData) return 0;
        if (selectedTab === 'buy') {
            const tusd = balanceData.find((b: any) => b.tokenSymbol === 'TUSD' && !b.eventId);
            return tusd ? Number(tusd.amount) : 0;
        } else {
            const tokenSymbol = `${selectedOutcomeId}_${selectedOption}`;
            const shares = balanceData.find((b: any) => b.tokenSymbol === tokenSymbol && b.eventId === eventId);
            return shares ? Number(shares.amount) : 0;
        }
    }, [balanceData, selectedTab, selectedOutcomeId, selectedOption, eventId]);

    // Calculate current market price for selected outcome
    const marketPrice = useMemo(() => {
        if (!selectedOutcome) return 0.5;
        const p = selectedOutcome.probability || 0;
        return selectedOption === 'YES' ? p : 1 - p;
    }, [selectedOutcome, selectedOption]);

    // Reset price when outcome or option changes
    useEffect(() => {
        if (orderType === 'limit') {
            setPrice(marketPrice.toFixed(2));
        }
    }, [selectedOutcomeId, selectedOption, orderType, marketPrice]);

    // Trading mutation
    const tradeMutation = useMutation({
        mutationFn: async () => {
            if (!selectedOutcomeId) throw new Error('No sub-market selected');

            const res = await fetch('/api/hybrid-trading', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    outcomeId: selectedOutcomeId,
                    option: selectedOption,
                    side: selectedTab,
                    amount: parseFloat(amount),
                    orderType,
                    price: orderType === 'limit' ? parseFloat(price) : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Trade failed');
            }
            return res.json();
        },
        onSuccess: () => {
            toast({
                title: 'Trade Successful',
                description: `Successfully placed ${orderType} order for ${amount} ${selectedOption} on ${selectedOutcome?.name}`,
            });
            queryClient.invalidateQueries({ queryKey: ['user-balances'] });
            queryClient.invalidateQueries({ queryKey: ['orders', eventId] });
            if (onTradeSuccess) onTradeSuccess();
            if (onTrade) onTrade();
        },
        onError: (err: any) => {
            toast({
                title: 'Trade Failed',
                description: err.message,
                variant: 'destructive',
            });
        },
    });

    // Handle trade intent from parent (e.g. clicking an order in the book)
    useEffect(() => {
        if (tradeIntent) {
            setSelectedTab(tradeIntent.side);
            setAmount(tradeIntent.amount.toString());
            if (tradeIntent.price) {
                setOrderType('limit');
                setPrice(tradeIntent.price.toString());
            } else {
                setOrderType('market');
            }
        }
    }, [tradeIntent]);

    const handleAmountChange = (val: string) => {
        if (val === '' || /^\d*\.?\d*$/.test(val)) {
            setAmount(val);
        }
    };

    const handlePriceChange = (val: string) => {
        if (val === '' || /^\d*\.?\d*$/.test(val)) {
            setPrice(val);
        }
    };

    const setAmountPercentage = (pct: number) => {
        if (currentBalance > 0) {
            setAmount((currentBalance * pct).toFixed(2));
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1a1d28] rounded-2xl border border-white/10 overflow-hidden">
            {/* Buy/Sell Tabs at Top */}
            <div className="flex p-1.5 bg-black/40 border-b border-white/10 gap-1">
                <button
                    onClick={() => setSelectedTab('buy')}
                    className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 uppercase tracking-wider",
                        selectedTab === 'buy' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    Buy
                </button>
                <button
                    onClick={() => setSelectedTab('sell')}
                    className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 uppercase tracking-wider",
                        selectedTab === 'sell' ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    Sell
                </button>
            </div>

            {/* Horizontal Scrollable Outcome List */}
            <div className="p-3 border-b border-white/10">
                <div
                    ref={scrollContainerRef}
                    className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
                >
                    {filteredOutcomes.map((o) => (
                        <button
                            key={o.id}
                            onClick={() => setSelectedOutcomeId(o.id)}
                            className={cn(
                                "flex-shrink-0 px-3 py-2 rounded-xl border transition-all duration-200 flex flex-col items-center gap-0.5 min-w-[110px]",
                                selectedOutcomeId === o.id
                                    ? "bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                                    : "bg-white/5 border-white/5 hover:border-white/20"
                            )}
                        >
                            <span className={cn(
                                "text-xs font-medium truncate w-full text-center",
                                selectedOutcomeId === o.id ? "text-blue-400" : "text-gray-400"
                            )}>
                                {o.name}
                            </span>
                            <span className="text-sm font-bold text-white">
                                {(o.probability * 100).toFixed(1)}%
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Trading Interface for Selected Outcome */}
            <div className="flex-1 flex flex-col min-h-0">
                {selectedOutcome ? (
                    <div className="p-3 space-y-3 overflow-y-auto no-scrollbar">
                        {/* Option Selection (YES/NO) */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setSelectedOption('YES')}
                                className={cn(
                                    "py-2.5 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-0.5",
                                    selectedOption === 'YES'
                                        ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                                        : "bg-white/5 border-transparent hover:border-white/10"
                                )}
                            >
                                <span className={cn("text-sm font-bold", selectedOption === 'YES' ? "text-emerald-400" : "text-gray-400")}>YES</span>
                                <span className="text-xs text-gray-500">{(selectedOutcome.probability * 100).toFixed(1)}%</span>
                            </button>
                            <button
                                onClick={() => setSelectedOption('NO')}
                                className={cn(
                                    "py-2.5 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-0.5",
                                    selectedOption === 'NO'
                                        ? "bg-rose-500/20 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                                        : "bg-white/5 border-transparent hover:border-white/10"
                                )}
                            >
                                <span className={cn("text-sm font-bold", selectedOption === 'NO' ? "text-rose-400" : "text-gray-400")}>NO</span>
                                <span className="text-xs text-gray-500">{((1 - selectedOutcome.probability) * 100).toFixed(1)}%</span>
                            </button>
                        </div>

                        {/* Order Type Toggle */}
                        <div className="flex items-center justify-between px-1">
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-tighter">Order Type</div>
                            <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/5">
                                <button
                                    onClick={() => setOrderType('market')}
                                    className={cn(
                                        "px-3 py-1 text-[10px] font-bold uppercase rounded transition-all",
                                        orderType === 'market' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    Market
                                </button>
                                <button
                                    onClick={() => setOrderType('limit')}
                                    className={cn(
                                        "px-3 py-1 text-[10px] font-bold uppercase rounded transition-all",
                                        orderType === 'limit' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    Limit
                                </button>
                            </div>
                        </div>

                        {/* Inputs */}
                        <div className="space-y-4">
                            {/* Price Input (only for Limit) */}
                            {orderType === 'limit' && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-tighter">
                                        <span>Limit Price</span>
                                        <span>Market: {marketPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={price}
                                            onChange={(e) => handlePriceChange(e.target.value)}
                                            className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all text-lg"
                                            placeholder="0.00"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">USD</span>
                                    </div>
                                </div>
                            )}

                            {/* Amount Input */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-tighter">
                                    <span>Amount</span>
                                    <span
                                        className="cursor-pointer hover:text-white transition-colors"
                                        onClick={() => setAmountPercentage(1)}
                                    >
                                        Max: {currentBalance.toFixed(2)} {selectedTab === 'buy' ? 'USD' : 'Shares'}
                                    </span>
                                </div>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={amount}
                                        onChange={(e) => handleAmountChange(e.target.value)}
                                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all text-lg"
                                        placeholder="0.00"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                                        {selectedTab === 'buy' ? 'USD' : 'Shares'}
                                    </span>
                                </div>

                                {/* Quick Amount Buttons */}
                                <div className="grid grid-cols-4 gap-2">
                                    {[10, 50, 100, 500].map((amt) => (
                                        <button
                                            key={amt}
                                            onClick={() => setAmount(amt.toString())}
                                            className="py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-all uppercase"
                                        >
                                            ${amt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Summary / Confirmation */}
                        {amount && parseFloat(amount) > 0 && (
                            <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Avg. Price</span>
                                    <span className="text-white font-bold">
                                        {orderType === 'market' ? marketPrice.toFixed(4) : parseFloat(price || '0').toFixed(4)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Estimated Payout</span>
                                    <span className="text-emerald-400 font-bold">
                                        {selectedTab === 'buy'
                                            ? (parseFloat(amount) / (orderType === 'market' ? marketPrice : parseFloat(price || '1'))).toFixed(2)
                                            : (parseFloat(amount) * (orderType === 'market' ? marketPrice : parseFloat(price || '0'))).toFixed(2)} USD
                                    </span>
                                </div>
                                <div className="pt-2 border-t border-white/5 flex justify-between text-sm">
                                    <span className="text-gray-300 font-bold uppercase tracking-tighter">Total Cost</span>
                                    <span className="text-white font-black">{parseFloat(amount).toFixed(2)} {selectedTab === 'buy' ? 'USD' : 'Shares'}</span>
                                </div>
                            </div>
                        )}

                        {/* Trade Button */}
                        <button
                            onClick={() => tradeMutation.mutate()}
                            disabled={tradeMutation.isPending || !amount || parseFloat(amount) <= 0}
                            className={cn(
                                "w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                                selectedTab === 'buy'
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500"
                                    : "bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500"
                            )}
                        >
                            {tradeMutation.isPending ? (
                                <div className="flex items-center justify-center gap-2">
                                    <LoadingSpinner className="w-5 h-5 text-white" />
                                    <span>Executing...</span>
                                </div>
                            ) : (
                                <span>{selectedTab === 'buy' ? 'Buy' : 'Sell'} {selectedOption} Tokens</span>
                            )}
                        </button>
                        {/* Terms of Use Footer */}
                        <p className="text-xs text-center text-gray-500 pb-2">
                            By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-8 h-8 text-gray-600" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-white font-bold">No Sub-market Selected</h4>
                            <p className="text-sm text-gray-500">Please select an outcome from the list above to start trading.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
