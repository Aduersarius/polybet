'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { useSession } from '@/lib/auth-client';
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
    outcomes: Outcome[];
    liveOutcomes?: Outcome[];
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (outcomeId: string, amount: number) => void;
    onTradeSuccess?: () => void;
    tradeIntent?: { side: 'buy' | 'sell', price: number, amount: number, outcomeId?: string } | null;
}

export function MultipleTradingPanel({ outcomes, liveOutcomes, creationDate, resolutionDate, onTrade, onTradeSuccess, tradeIntent }: MultipleTradingPanelProps) {
    const params = useParams();
    const eventId = params.id as string;
    const { data: session } = useSession();
    const isAuthenticated = Boolean((session as any)?.user);
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

    const stablecoinBalance = balanceData?.balances?.find((b: any) => b.tokenSymbol === 'TUSD')?.amount || 0;

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

    // Use live outcomes from props, fallback to static outcomes
    const effectiveOutcomes = liveOutcomes || outcomes;

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


    // Use live outcomes for display, fallback to static outcomes
    const currentOutcomes = effectiveOutcomes;
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
                    variant: 'default',
                    title: 'Trade warning',
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

            toast({
                variant: 'success',
                title: 'Trade successful',
                description: `${selectedTab === 'buy' ? 'Bought' : 'Sold'} ${result.totalFilled.toFixed(2)} ${currentSelectedOutcome?.name || 'tokens'}`,
            });
        },
        onError: (error) => {
            console.error('Trade error:', error);
            const message = error instanceof Error ? error.message : 'Failed to place trade';

            if (message.toLowerCase().includes('authentication required')) {
                toast({
                    variant: 'destructive',
                    title: 'Sign in required',
                    description: 'You need to be logged in to place trades.',
                });
            } else if (message.startsWith('Risk Check Failed')) {
                // Show user-friendly notification for risk check failures
                toast({
                    variant: 'destructive',
                    title: 'Risk check failed',
                    description: `${message.replace('Risk Check Failed: ', '')}. The trade was not executed to protect your position.`,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Trade failed',
                    description: message,
                });
            }
        },
        onSettled: () => {
            setIsLoading(false);
        }
    });

    const handleTrade = () => {
        if (!amount || parseFloat(amount) <= 0 || !selectedOutcomeId) return;

        if (!isAuthenticated) {
            toast({
                variant: 'destructive',
                title: 'Sign in required',
                description: 'You need to be logged in to place trades.',
            });
            return;
        }
        setIsLoading(true);
        tradeMutation.mutate();
    };

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

            <div className="p-4 space-y-4">
                {/* Outcome Selector */}
                <div className="space-y-2">
                    <div className="text-sm text-gray-400">Select Outcome</div>
                    <div className={`grid gap-2 max-h-60 overflow-y-auto ${currentOutcomes.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {currentOutcomes.map((outcome) => {
                            const outcomeBalance = userBalances?.find((b: any) => b.tokenSymbol === outcome.id)?.amount || 0;
                            const isTileView = currentOutcomes.length > 3;

                            return (
                                <button
                                    key={outcome.id}
                                    onClick={() => setSelectedOutcomeId(outcome.id)}
                                    className={`relative flex items-center justify-between rounded-lg border transition-all ${isTileView ? 'p-2' : 'p-3'
                                        } ${selectedOutcomeId === outcome.id
                                            ? 'bg-[#bb86fc]/20 border-[#bb86fc] text-[#bb86fc]'
                                            : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {outcome.color && (
                                            <div
                                                className={`rounded-full shrink-0 ${isTileView ? 'w-2 h-2' : 'w-3 h-3'}`}
                                                style={{ backgroundColor: outcome.color }}
                                            />
                                        )}
                                        <div className="flex flex-col items-start min-w-0">
                                            <span className={`font-medium truncate max-w-[100px] ${isTileView ? 'text-xs' : 'text-sm'}`}>
                                                {outcome.name}
                                            </span>
                                            {selectedTab === 'sell' && (
                                                <span className="text-[10px] opacity-60 truncate">
                                                    {outcomeBalance.toFixed(1)} owned
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`${isTileView ? 'text-sm' : 'text-xs'} opacity-80 font-bold ml-2`}>
                                        {Math.round(outcome.probability * 100)}%
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Amount/Shares Input */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                        <span>{selectedTab === 'buy' ? 'Amount' : 'Shares'}</span>
                        <span className="text-white font-medium">
                            {selectedTab === 'buy'
                                ? `$${currentAmount.toFixed(2)}`
                                : `${currentAmount.toFixed(2)} shares`
                            }
                        </span>
                    </div>
                    <div className="relative">
                        {selectedTab === 'buy' && (
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        )}
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className={`w-full bg-white/5 border border-white/10 rounded-lg py-3 ${selectedTab === 'buy' ? 'pl-8' : 'pl-4'} pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#bb86fc] transition-colors text-lg font-medium`}
                            placeholder="0"
                        />
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
                    className="w-full py-3 rounded-lg font-bold text-black transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                        backgroundColor: '#4CAF50',
                        boxShadow: '0 0 20px rgba(76, 175, 80, 0.2)'
                    }}
                >
                    {isLoading
                        ? 'Processing...'
                        : parseFloat(amount) > MAX_BET_AMOUNT
                            ? `Max bet: $${MAX_BET_AMOUNT.toLocaleString()}`
                            : `${selectedTab === 'buy' ? 'Buy' : 'Sell'} ${currentSelectedOutcome?.name || 'Outcome'} ${orderType === 'market' ? '(Market)' : '(Limit)'}`
                    }
                </button>

                {/* Trade Success Feedback moved to toast notifications */}

                <p className="text-xs text-center text-gray-500">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>
        </div>
    );
}