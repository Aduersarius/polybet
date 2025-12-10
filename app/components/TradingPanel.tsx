'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { socket } from '@/lib/socket';
import { calculateLMSROdds } from '@/lib/amm';
import { toast } from '@/components/ui/use-toast';
import { useSession } from '@/lib/auth-client';
import { Slider } from '@/components/ui/slider';
import { useSettings } from '@/lib/settings-context';
import { AlertTriangle, X } from 'lucide-react';

interface TradingPanelProps {
    eventId?: string;
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (type: 'YES' | 'NO', amount: number) => void;
    tradeIntent?: { side: 'buy' | 'sell', price: number, amount: number, outcomeId?: string } | null;
    preselectedOption?: 'YES' | 'NO';
}

export function TradingPanel({ eventId: propEventId, creationDate, resolutionDate, onTrade, tradeIntent, preselectedOption }: TradingPanelProps) {
    const params = useParams();
    const routeEventId = (params as any)?.id as string | undefined;
    const eventId = (propEventId || routeEventId) as string | undefined;
    const { data: session } = useSession();
    const isAuthenticated = Boolean((session as any)?.user);

    const [selectedTab, setSelectedTab] = useState<'buy' | 'sell'>('buy');
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>(preselectedOption || 'YES');
    const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
    const [amount, setAmount] = useState<string>('');
    const [price, setPrice] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(false);
    const [lastTrade, setLastTrade] = useState<{ tokens: number, price: number, orderType?: string, orderAmount?: number, orderPrice?: number, orderId?: string } | null>(null);
    const [balancePct, setBalancePct] = useState<number>(0);
    const [yesPrice, setYesPrice] = useState<number>(0.5);
    const [noPrice, setNoPrice] = useState<number>(0.5);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const { settings, formatCurrency, formatOdds } = useSettings();

    // Fetch user balances - fetch when sell tab is selected
    const { data: balanceData, refetch: refetchBalances } = useQuery({
        queryKey: ['user-balances', eventId],
        queryFn: async () => {
            const response = await fetch('/api/balance');
            if (!response.ok) return { balances: [] };
            return await response.json();
        },
        enabled: !!eventId,
        staleTime: 0,
    });

    // Auto-fill from trade intent (Order Book click)
    useEffect(() => {
        if (tradeIntent) {
            setSelectedTab(tradeIntent.side);
            setOrderType('limit');
            setPrice(tradeIntent.price.toFixed(2));
            setAmount(tradeIntent.amount.toString());
            if (tradeIntent.outcomeId === 'YES' || tradeIntent.outcomeId === 'NO') {
                setSelectedOption(tradeIntent.outcomeId);
            }
        }
    }, [tradeIntent]);

    // Fetch event data for initial odds calculation
    const { data: eventData } = useQuery({
        queryKey: ['event', eventId],
        queryFn: async () => {
            const response = await fetch(`/api/events/${eventId}`);
            if (!response.ok) throw new Error('Failed to fetch event');
            return await response.json();
        },
        staleTime: 30000, // 30 seconds
    });

    // Refetch when switching to sell tab
    useEffect(() => {
        if (selectedTab === 'sell') {
            refetchBalances();
        }
    }, [selectedTab, refetchBalances]);

    // Calculate initial prices from event data on mount
    useEffect(() => {
        if (eventData && eventData.qYes !== undefined && eventData.qNo !== undefined) {
            const b = eventData.liquidityParameter || 10000.0;
            const odds = calculateLMSROdds(eventData.qYes, eventData.qNo, b);
            setYesPrice(odds.yesPrice);
            setNoPrice(odds.noPrice);
        }
    }, [eventData]);

    // Find balance for the selected outcome
    // For binary events, tokenSymbol is `YES_${eventId}` or `NO_${eventId}`
    const expectedTokenSymbol = `${selectedOption}_${eventId}`;

    // Try both matching strategies
    let selectedOutcomeBalance = balanceData?.balances?.find((b: any) =>
        b.tokenSymbol === expectedTokenSymbol && b.eventId === eventId
    );

    // Fallback: match by eventId and tokenSymbol starting with selectedOption
    if (!selectedOutcomeBalance) {
        selectedOutcomeBalance = balanceData?.balances?.find((b: any) =>
            b.eventId === eventId && b.tokenSymbol?.startsWith(selectedOption)
        );
    }

    const availableShares = selectedOutcomeBalance?.amount || 0;

    // Stablecoin balance (TUSD) for buy-side percentage slider
    const stablecoinBalance = balanceData?.balances?.find((b: any) => b.tokenSymbol === 'TUSD')?.amount || 0;

    // Set default limit price to current market price
    useEffect(() => {
        if (orderType === 'limit') {
            // Only set default if price is 0 or empty, to avoid overwriting user input or tradeIntent
            if (!price || price === '0') {
                if (selectedOption === 'YES') {
                    setPrice(yesPrice.toFixed(2));
                } else if (selectedOption === 'NO') {
                    setPrice(noPrice.toFixed(2));
                }
            }
        }
    }, [orderType, selectedOption, yesPrice, noPrice]); // Removed price dependency to avoid loop

    // Real-time odds updates via WebSocket
    useEffect(() => {
        const handler = (update: any) => {
            if (update.eventId !== eventId) return;

            if (update.yesPrice !== undefined) {
                setYesPrice(update.yesPrice);
            }
            if (update.noPrice !== undefined) {
                setNoPrice(update.noPrice);
            }
        };

        socket.on(`odds-update-${eventId}`, handler);
        return () => {
            socket.off(`odds-update-${eventId}`, handler);
        };
    }, [eventId]);



    // Prices are probabilities (0-1), convert to percentages
    // Handle edge cases and ensure valid probabilities
    const safeYesPrice = Math.max(0, Math.min(1, yesPrice || 0.5));
    const safeNoPrice = Math.max(0, Math.min(1, noPrice || 0.5));

    const yesProbability = Math.round(safeYesPrice * 100);
    const noProbability = Math.round(safeNoPrice * 100);

    // Calculate odds from prices (decimal odds = 1 / price)
    const yesOdds = yesPrice > 0 ? (1 / yesPrice) : 1;
    const noOdds = noPrice > 0 ? (1 / noPrice) : 1;

    // Calculate potential payout for current amount
    const currentAmount = parseFloat(amount) || 0;
    const currentPrice = orderType === 'limit' && price ? parseFloat(price) : (selectedOption === 'YES' ? yesPrice : noPrice);

    // For buy: payout = amount_spent / price (shares received)
    // For sell: payout = amount_shares * price (USD received)
    const potentialPayout = selectedTab === 'buy'
        ? currentAmount * (1 / currentPrice) // Shares received
        : currentAmount * currentPrice; // USD received

    // Profit calculation (only meaningful for buy orders)
    const potentialProfit = selectedTab === 'buy' ? potentialPayout - currentAmount : 0;

    const tradeMutation = useMutation({
        mutationFn: async () => {
            if (!eventId) {
                throw new Error('Missing event id');
            }

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
            toast({
                variant: 'success',
                title: 'Trade successful',
                description: `${selectedTab === 'buy' ? 'Bought' : 'Sold'} ${result.totalFilled.toFixed(2)} ${selectedOption} tokens`,
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
        if (!amount || parseFloat(amount) <= 0) return;

        if (!isAuthenticated) {
            toast({
                variant: 'destructive',
                title: 'Sign in required',
                description: 'You need to be logged in to place trades.',
            });
            return;
        }

        // Show confirmation dialog if setting is enabled
        if (settings.trading.confirmOrders) {
            setShowConfirmDialog(true);
        } else {
            executeTrade();
        }
    };

    const executeTrade = () => {
        setShowConfirmDialog(false);
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

                {/* Amount/Shares Input */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                        <span>{selectedTab === 'buy' ? 'Amount' : 'Shares'}</span>
                        <span className="text-white font-medium">
                            {selectedTab === 'buy'
                                ? `$${currentAmount.toFixed(2)}`
                                : <><span className="text-gray-400 font-normal">Max:</span> {availableShares.toFixed(2)} shares</>
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
                    {currentAmount > 0 && (
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
                                    <span>If {selectedOption.toLowerCase()} wins:</span>
                                    <span className="font-medium text-green-400">
                                        ${(potentialPayout * (selectedOption === 'YES' ? yesOdds : noOdds)).toFixed(2)}
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
                                    : `${availableShares.toFixed(2)} shares available`}
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
                                    const base = selectedTab === 'buy' ? stablecoinBalance : availableShares;
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
                                Current market price: ${(selectedOption === 'YES' ? yesPrice : noPrice).toFixed(2)}
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

                {/* Trade Success Feedback moved to toast notifications */}

                <p className="text-xs text-center text-gray-500">
                    By trading, you agree to the <a href="#" className="underline hover:text-gray-400">Terms of Use</a>.
                </p>
            </div>

            {/* Confirmation Dialog */}
            <AnimatePresence>
                {showConfirmDialog && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setShowConfirmDialog(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${selectedOption === 'YES' ? 'bg-[#03dac6]/20' : 'bg-[#cf6679]/20'}`}>
                                        <AlertTriangle className={`w-5 h-5 ${selectedOption === 'YES' ? 'text-[#03dac6]' : 'text-[#cf6679]'}`} />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Confirm Trade</h3>
                                </div>
                                <button
                                    onClick={() => setShowConfirmDialog(false)}
                                    className="p-1 rounded-lg hover:bg-white/10 text-gray-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Action</span>
                                    <span className="text-white font-medium">{selectedTab === 'buy' ? 'Buy' : 'Sell'} {selectedOption}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">{selectedTab === 'buy' ? 'Amount' : 'Shares'}</span>
                                    <span className="text-white font-medium">
                                        {selectedTab === 'buy' ? formatCurrency(parseFloat(amount)) : `${parseFloat(amount).toFixed(2)} shares`}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Price</span>
                                    <span className="text-white font-medium">{formatOdds(currentPrice)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">You receive</span>
                                    <span className={`font-bold ${selectedOption === 'YES' ? 'text-[#03dac6]' : 'text-[#cf6679]'}`}>
                                        {selectedTab === 'buy' ? `${potentialPayout.toFixed(2)} shares` : formatCurrency(potentialPayout)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmDialog(false)}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-gray-400 font-medium hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeTrade}
                                    className={`flex-1 py-3 rounded-lg font-bold text-black transition-all ${selectedOption === 'YES' ? 'bg-[#03dac6] hover:bg-[#02b3a5]' : 'bg-[#cf6679] hover:bg-[#b85868]'
                                        }`}
                                >
                                    Confirm
                                </button>
                            </div>

                            <p className="text-xs text-center text-gray-500 mt-4">
                                You can disable confirmations in Settings
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
