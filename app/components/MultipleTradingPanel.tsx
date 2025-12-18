'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { getUserFriendlyError } from '@/lib/error-messages';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HelpBanner } from '@/components/ui/HelpBanner';

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

    // Fetch user balances for all outcomes in this event
    const { data: balanceData } = useQuery({
        queryKey: ['user-balances', eventId],
        queryFn: async () => {
            const response = await fetch('/api/balance');
            if (!response.ok) return { balances: [] };
            return await response.json();
        },
        enabled: !!eventId && selectedTab === 'sell'
    });

    const userBalances = balanceData?.balances?.filter((b: any) =>
        b.eventId === eventId && b.tokenSymbol !== 'TUSD'
    ) || [];

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
                {/* Help Banner */}
                <HelpBanner
                    type="tip"
                    message={selectedTab === 'buy' 
                        ? "This is a multiple-choice market. Choose the outcome you believe will happen and buy shares. If that outcome wins, each share is worth $1." 
                        : "Sell shares from your current position. You can only sell outcomes you own shares in."
                    }
                    storageKey={`multi-trading-${selectedTab}-help`}
                />
                
                {/* Outcome Selector */}
                <div className="space-y-2">
                    <div className="text-sm text-gray-400 flex items-center gap-1.5">
                        Select Outcome
                        <InfoTooltip 
                            content="Choose which outcome you want to trade. Each outcome shows its current probability of occurring."
                            side="top"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {currentOutcomes.map((outcome) => {
                            const outcomeBalance = userBalances?.find((b: any) => b.tokenSymbol === outcome.id)?.amount || 0;
                            return (
                                <button
                                    key={outcome.id}
                                    onClick={() => setSelectedOutcomeId(outcome.id)}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${selectedOutcomeId === outcome.id
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
                                        <div className="flex flex-col items-start">
                                            <span className="font-medium">{outcome.name}</span>
                                            {selectedTab === 'sell' && (
                                                <span className="text-xs opacity-60">
                                                    {outcomeBalance.toFixed(2)} shares owned
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xs opacity-80">{Math.round(outcome.probability * 100)}%</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Amount/Shares Input */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                        <span className="flex items-center gap-1.5">
                            {selectedTab === 'buy' ? 'Amount' : 'Shares'}
                            <InfoTooltip 
                                content={selectedTab === 'buy' 
                                    ? "Enter the dollar amount you want to spend. Minimum $0.10, maximum $10,000." 
                                    : "Enter the number of shares you want to sell from your position."
                                }
                                side="top"
                            />
                        </span>
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

                    <div className="flex gap-2">
                        {selectedTab === 'buy' ? (
                            // Buy presets: USD amounts
                            ['+1', '+20', '+100', 'Max'].map((val) => (
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

                <p className="text-xs text-center text-gray-500">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>
        </div>
    );
}