'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { getUserFriendlyError } from '@/lib/error-messages';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Slider } from '@/components/ui/slider';

interface Outcome {
    id: string;
    name: string;
    probability: number;
    price: number;
    odds: number;
    color?: string;
}

interface MultipleTradingPanelProps {
    eventId?: string;
    outcomes: Outcome[];
    liveOutcomes?: Outcome[];
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (outcomeId: string, amount: number) => void;
    onTradeSuccess?: () => void;
    tradeIntent?: { side: 'buy' | 'sell', price: number, amount: number, outcomeId?: string } | null;
}

export function MultipleTradingPanel({ eventId: propEventId, outcomes, liveOutcomes, creationDate, resolutionDate, onTrade, onTradeSuccess, tradeIntent }: MultipleTradingPanelProps) {
    const params = useParams();
    const eventId = propEventId || (params.id as string);
    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(outcomes[0]?.id || '');
    const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
    const [amount, setAmount] = useState<string>('');
    const [price, setPrice] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(false);
    const [lastTrade, setLastTrade] = useState<{ tokens: number, price: number, orderType?: string, orderAmount?: number, orderPrice?: number, orderId?: string } | null>(null);
    const [balancePct, setBalancePct] = useState<number>(0);

    // Fetch user balances for all outcomes in this event
    const { data: balanceData } = useQuery({
        queryKey: ['user-balances', eventId],
        queryFn: async () => {
            const response = await fetch('/api/balance');
            if (!response.ok) return { balances: [] };
            return await response.json();
        },
        enabled: !!eventId
    });

    const userBalances = balanceData?.balances?.filter((b: any) =>
        b.eventId === eventId && b.tokenSymbol !== 'TUSD'
    ) || [];

    const stablecoinBalance = parseFloat(balanceData?.balances?.find((b: any) => b.tokenSymbol === 'TUSD')?.amount || '0');

    // Auto-fill from trade intent (Order Book click)
    useEffect(() => {
        if (tradeIntent) {
            setSelectedTab(tradeIntent.side);
            setOrderType('limit');
            setPrice(tradeIntent.price.toFixed(2));
            setAmount(tradeIntent.amount.toString());
            if (tradeIntent.outcomeId) {
                setSelectedOutcomeId(tradeIntent.outcomeId);
            }
        }
    }, [tradeIntent]);

    // Risk management: maximum bet amount
    const MAX_BET_AMOUNT = 10000; // $10,000 max bet

    const selectedOutcome = outcomes.find(o => o.id === selectedOutcomeId);

    // Use live outcomes for constant real-time correctness
    // Initialized from props, then updated via WebSocket hot ingestion
    const [hotOutcomes, setHotOutcomes] = useState<Outcome[]>(liveOutcomes || outcomes);
    const effectiveOutcomes = hotOutcomes;

    // Normalize outcomes to ensure they always have price and odds calculated from probability
    const normalizedOutcomes = effectiveOutcomes.map((outcome) => {
        let probability = outcome.probability ?? 0;
        // Normalize probability: if > 1, assume it's a percentage and convert to decimal
        if (probability > 1) {
            probability = probability / 100;
        }
        // Ensure probability is between 0 and 1
        probability = Math.max(0, Math.min(1, probability));
        // Calculate price and odds from probability if missing
        const price = outcome.price ?? probability;
        const odds = outcome.odds ?? (probability > 0 ? 1 / probability : 1);
        return {
            ...outcome,
            probability, // Always in decimal form (0-1)
            price,
            odds,
        };
    });

    // Update selected outcome when outcomes change
    useEffect(() => {
        if (outcomes.length > 0 && !outcomes.find(o => o.id === selectedOutcomeId)) {
            setSelectedOutcomeId(outcomes[0].id);
        }
    }, [outcomes, selectedOutcomeId]);


    // Listen for real-time odds updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');
        const channel = socket.subscribe(`event-${eventId}`);

        const handler = (update: any) => {
            if (update.eventId !== eventId) return;

            // If we have an outcomes array in the update, use it
            if (update.outcomes) {
                // Map local outcome objects to update their price/probability
                setHotOutcomes(prev => prev.map(oc => {
                    const match = update.outcomes.find((u: any) => u.id === oc.id);
                    if (match) {
                        const prob = match.probability ?? oc.probability;
                        return {
                            ...oc,
                            probability: prob,
                            price: prob, // Update price as well
                            odds: prob > 0 ? 1 / prob : 1
                        };
                    }
                    return oc;
                }));
            }
        };

        channel.bind('odds-update', handler);

        return () => {
            channel.unbind('odds-update', handler);
            socket.unsubscribe(`event-${eventId}`);
        };
    }, [eventId]);

    // Update hotOutcomes if props change
    useEffect(() => {
        setHotOutcomes(liveOutcomes || outcomes);
    }, [liveOutcomes, outcomes]);


    // Update price when outcome changes or hotOutcomes update
    useEffect(() => {
        const normalizedSelected = normalizedOutcomes.find(o => o.id === selectedOutcomeId);
        if (normalizedSelected && orderType === 'limit') {
            // Only update if current price is unset or was just initialized
            if (!price || price === '0' || price === '0.00') {
                setPrice(normalizedSelected.price.toFixed(2));
            }
        }
    }, [normalizedOutcomes, selectedOutcomeId, orderType, price]);

    // Reset price when outcome changes to force a re-seed from market
    useEffect(() => {
        setPrice('0');
    }, [selectedOutcomeId]);


    // Use normalized outcomes for display
    const currentOutcomes = normalizedOutcomes;
    const currentSelectedOutcome = currentOutcomes.find(o => o.id === selectedOutcomeId);

    // Get user's balance for the selected outcome
    const selectedOutcomeBalance = userBalances?.find((b: any) => b.tokenSymbol === selectedOutcomeId)?.amount || 0;

    const currentAmount = parseFloat(amount) || 0;
    const currentPrice = orderType === 'limit' && price ? parseFloat(price) : (currentSelectedOutcome?.price || 0);

    // For buy: payout = shares received
    // For sell: payout = USD received
    const potentialPayout = selectedTab === 'buy'
        ? currentAmount * (1 / currentPrice) // Shares received
        : currentAmount * currentPrice; // USD received

    // Profit calculation (only meaningful for buy orders)
    const potentialProfit = selectedTab === 'buy' ? potentialPayout - currentAmount : 0;

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
                    // Removed hardcoded userId - let API use session auth
                }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Trade failed');
            }

            return await res.json();
        },
        onSuccess: (result) => {
            if (result.warning) {
                // Display user-friendly notification for risk concern
                toast({
                    variant: 'warning',
                    title: '⚠️ Trade Warning',
                    description: result.warning,
                });
            }

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
            const { title, description, variant } = getUserFriendlyError(error);
            toast({
                variant,
                title,
                description,
            });
        },
        onSettled: () => {
            setIsLoading(false);
        }
    });

    const handleTrade = () => {
        // Validate amount exists and is positive
        if (!amount || parseFloat(amount) <= 0) {
            toast({
                variant: 'warning',
                title: '🔢 Invalid Amount',
                description: 'Please enter an amount greater than $0',
            });
            return;
        }

        // Validate outcome is selected
        if (!selectedOutcomeId) {
            toast({
                variant: 'warning',
                title: '🎯 Select an Outcome',
                description: 'Please select which outcome you want to trade',
            });
            return;
        }

        const amountNum = parseFloat(amount);
        const MIN_BET = 0.10;

        // Check minimum bet
        if (amountNum < MIN_BET) {
            toast({
                variant: 'warning',
                title: '📊 Bet Too Small',
                description: `Minimum bet is $${MIN_BET.toFixed(2)}. Please increase your amount.`,
            });
            return;
        }

        // Check maximum bet
        if (amountNum > MAX_BET_AMOUNT) {
            toast({
                variant: 'warning',
                title: '📊 Bet Too Large',
                description: `Maximum bet is $${MAX_BET_AMOUNT.toLocaleString()}. Please reduce your amount.`,
            });
            return;
        }

        // For sell orders, check if user has enough outcome tokens
        if (selectedTab === 'sell') {
            if (amountNum > selectedOutcomeBalance) {
                toast({
                    variant: 'warning',
                    title: '💰 Insufficient Position',
                    description: `You only have ${selectedOutcomeBalance.toFixed(2)} shares of this outcome. Please reduce your sell amount to ${selectedOutcomeBalance.toFixed(2)} or less.`,
                });
                return;
            }
        }

        // All validations passed - proceed with trade
        setIsLoading(true);
        tradeMutation.mutate();
    };

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll selected outcome into view
    useEffect(() => {
        if (selectedOutcomeId && scrollContainerRef.current) {
            const index = currentOutcomes.findIndex(o => o.id === selectedOutcomeId);
            if (index >= 0) {
                const container = scrollContainerRef.current;
                const item = container.children[index] as HTMLElement;
                if (item) {
                    item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        }
    }, [selectedOutcomeId, currentOutcomes]);

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
                    {currentOutcomes.map((outcome) => {
                        const outcomeBalance = userBalances?.find((b: any) => b.tokenSymbol === outcome.id)?.amount || 0;
                        return (
                            <button
                                key={outcome.id}
                                onClick={() => setSelectedOutcomeId(outcome.id)}
                                className={cn(
                                    "flex-shrink-0 px-3 py-2 rounded-xl border transition-all duration-200 flex flex-col items-center gap-0.5 min-w-[120px]",
                                    selectedOutcomeId === outcome.id
                                        ? "bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                                        : "bg-white/5 border-white/5 hover:border-white/20"
                                )}
                            >
                                <span className={cn(
                                    "text-xs font-medium truncate w-full text-center",
                                    selectedOutcomeId === outcome.id ? "text-blue-400" : "text-gray-400"
                                )}>
                                    {outcome.name}
                                </span>
                                <span className="text-sm font-bold text-white">
                                    {Math.round(outcome.probability * 100)}%
                                </span>
                                {selectedTab === 'sell' && outcomeBalance > 0 && (
                                    <span className="text-[10px] text-gray-500">{outcomeBalance.toFixed(2)} owned</span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Trading Interface */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-3 space-y-3 overflow-y-auto no-scrollbar">

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

                    <div className="space-y-4">
                        {/* Amount/Shares Input */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-tighter">
                                <span className="flex items-center gap-1.5">
                                    {selectedTab === 'buy' ? 'Amount' : 'Shares'}
                                </span>
                                <span className="text-white font-medium">
                                    {selectedTab === 'buy'
                                        ? `$${currentAmount.toFixed(2)}`
                                        : `${currentAmount.toFixed(2)} shares`
                                    }
                                </span>
                            </div>

                            <div className="flex gap-2">
                                {selectedTab === 'buy' ? (
                                    // Buy presets: USD amounts
                                    ['+1', '+10', '+50', '+100', 'Max'].map((val) => (
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
                                    ))
                                ) : (
                                    // Sell presets: percentage of selected outcome's shares
                                    ['25%', '50%', 'ALL'].map((val) => (
                                        <button
                                            key={val}
                                            onClick={() => {
                                                if (val === 'ALL') {
                                                    setAmount(selectedOutcomeBalance.toString());
                                                } else {
                                                    const percentage = parseFloat(val.replace('%', '')) / 100;
                                                    setAmount((selectedOutcomeBalance * percentage).toString());
                                                }
                                            }}
                                            className="flex-1 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                                            disabled={selectedOutcomeBalance === 0}
                                        >
                                            {val}
                                        </button>
                                    ))
                                )}
                            </div>
                            <div className="relative group">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all text-lg"
                                    placeholder="0"
                                />
                                {selectedTab === 'buy' && (
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                )}
                            </div>

                            {/* Balance Slider */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-xs text-gray-400">
                                    <span>Use balance</span>
                                    <span className="text-gray-300">
                                        {selectedTab === 'buy'
                                            ? `$${stablecoinBalance.toFixed(2)} available`
                                            : `${selectedOutcomeBalance.toFixed(2)} shares available`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Slider
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={[balancePct]}
                                        className="flex-1"
                                        onValueChange={(value: number[]) => {
                                            const pct = Math.max(0, Math.min(100, value?.[0] ?? 0));
                                            setBalancePct(pct);
                                            const base = selectedTab === 'buy' ? stablecoinBalance : selectedOutcomeBalance;
                                            const nextAmount = base * (pct / 100);
                                            setAmount(nextAmount > 0 ? nextAmount.toFixed(2) : '');
                                        }}
                                    />
                                    <span className="w-10 text-right text-xs text-gray-300">
                                        {balancePct.toFixed(0)}%
                                    </span>
                                </div>
                            </div>

                            {/* Payout Display */}
                            {currentAmount > 0 && currentSelectedOutcome && (
                                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-400">
                                            {selectedTab === 'buy' ? 'You will receive:' : 'You will receive:'}
                                        </span>
                                        <span className="text-white font-bold">
                                            {selectedTab === 'buy'
                                                ? `${potentialPayout.toFixed(2)} shares`
                                                : `$${potentialPayout.toFixed(2)}`
                                            }
                                        </span>
                                    </div>
                                    {selectedTab === 'buy' && (
                                        <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                                            <span>If {currentSelectedOutcome.name} wins:</span>
                                            <span className="font-medium text-green-400">
                                                ${(potentialPayout * currentSelectedOutcome.odds).toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}



                            {/* Order Type Selection Removed (Moved Up) */}

                            {/* Limit Price Input */}
                            {orderType === 'limit' && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-tighter">
                                        <span>Limit Price</span>
                                        <span className="text-white font-medium">${(parseFloat(price) * 100).toFixed(2)}</span>
                                    </div>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value)}
                                            className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all text-lg"
                                            placeholder="0.50"
                                            step="0.01"
                                            min="0.01"
                                            max="0.99"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Current market price: ${(currentSelectedOutcome?.price.toFixed(2) || '0.00')}
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
                            className={cn(
                                "w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                                selectedTab === 'buy'
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500"
                                    : "bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500"
                            )}
                        >
                            {isLoading
                                ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <LoadingSpinner className="w-5 h-5 text-white" />
                                        <span>Processing...</span>
                                    </div>
                                )
                                : parseFloat(amount) > MAX_BET_AMOUNT
                                    ? `Max bet: $${MAX_BET_AMOUNT.toLocaleString()}`
                                    : `${selectedTab === 'buy' ? 'Buy' : 'Sell'} Tokens`
                            }
                        </button>
                    </div>
                </div>

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
                                    Limit order placed! {selectedTab === 'buy' ? 'Buy' : 'Sell'} {lastTrade.orderAmount?.toFixed(2)} {currentSelectedOutcome?.name} tokens at ${(lastTrade.orderPrice! * 100).toFixed(2)}
                                </p>
                                <p className="text-green-300 text-xs mt-1">
                                    If {currentSelectedOutcome?.name} wins, you'll receive ${(lastTrade.orderAmount! * (currentSelectedOutcome ? 1 / lastTrade.orderPrice! : 1)).toFixed(2)} total
                                </p>
                                <p className="text-green-300 text-xs">
                                    Order ID: {lastTrade.orderId}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-green-400 text-sm font-medium">
                                    Trade successful! You {selectedTab === 'buy' ? 'bought' : 'sold'} {lastTrade.tokens.toFixed(2)} {currentSelectedOutcome?.name} tokens
                                </p>
                                {selectedTab === 'buy' ? (
                                    <p className="text-green-300 text-xs mt-1">
                                        If {currentSelectedOutcome?.name} wins, you'll receive ${(lastTrade.tokens * (currentSelectedOutcome ? currentSelectedOutcome.odds : 1)).toFixed(2)} total
                                    </p>
                                ) : (
                                    <p className="text-green-300 text-xs mt-1">
                                        You received ${(lastTrade.tokens * lastTrade.price).toFixed(2)} USD
                                    </p>
                                )}
                            </>
                        )}
                    </motion.div>
                )}



                <p className="text-xs text-center text-gray-500 pb-2">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>
        </div>
    );
}