'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { socket } from '@/lib/socket';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

import { calculateLMSROdds } from '@/lib/amm';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { Slider } from '@/components/ui/slider';
import { useSettings } from '@/lib/settings-context';
import { AlertTriangle, X } from 'lucide-react';
import { getUserFriendlyError, getBalanceError, getMinimumBetError, getMaximumBetError } from '@/lib/error-messages';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HelpBanner } from '@/components/ui/HelpBanner';
import { getOutcomeColor } from '@/lib/colors';
import { EnhancedDepositModal } from '@/components/wallet/EnhancedDepositModal';
import { SuccessConfetti, useSuccessConfetti } from '@/components/ui/SuccessConfetti';
import { track } from '@vercel/analytics/react';
import { PLATFORM_MARKUP, PLATFORM_FEE } from '@/lib/constants';

interface TradingPanelProps {
    eventId?: string;
    creationDate?: string;
    resolutionDate?: string;
    onTrade?: (type: 'YES' | 'NO', amount: number) => void;
    tradeIntent?: { side: 'buy' | 'sell', price: number, amount: number, outcomeId?: string } | null;
    preselectedOption?: 'YES' | 'NO';
    variant?: 'default' | 'modal';
    eventData?: any; // Pass event data from parent to avoid refetching
}

export function TradingPanel({ eventId: propEventId, creationDate, resolutionDate, onTrade, tradeIntent, preselectedOption, variant = 'default', eventData: propEventData }: TradingPanelProps) {
    const params = useParams();
    const routeEventId = (params as any)?.id as string | undefined;
    const eventId = (propEventId || routeEventId) as string | undefined;

    // Fetch event if not provided
    const { data: fetchedEventData } = useQuery({
        queryKey: ['event', eventId],
        queryFn: async () => {
            const response = await fetch(`/api/events/${eventId}`);
            if (!response.ok) throw new Error('Failed to fetch event');
            return response.json();
        },
        enabled: !propEventData && !!eventId, // Only fetch if not provided as prop
        staleTime: 60000,
    });

    const eventData = propEventData || fetchedEventData;
    const resolvedEventId = eventData?.id || eventId;
    const { data: session } = useSession();
    const isAuthenticated = Boolean((session as any)?.user);

    // Outcome colors from centralized system
    const yesColor = getOutcomeColor(1); // #03DAC6
    const noColor = getOutcomeColor(2); // #CF6679
    const focusColor = getOutcomeColor(0); // #BB86FC

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
    const [amountInputFocused, setAmountInputFocused] = useState(false);
    const [priceInputFocused, setPriceInputFocused] = useState(false);
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

    // Success animation
    const tradeButtonRef = useRef<HTMLButtonElement>(null);
    const { isActive: showConfetti, originX, originY, trigger: triggerConfetti, onComplete: onConfettiComplete } = useSuccessConfetti();

    const { settings, formatCurrency, formatOdds } = useSettings();

    // Fetch user balances - fetch when sell tab is selected
    const { data: balanceData, refetch: refetchBalances, isLoading: isBalanceLoading } = useQuery({
        queryKey: ['user-balances', resolvedEventId, session?.user?.id],
        queryFn: async () => {
            const res = await fetch(`/api/balance?eventId=${resolvedEventId}`);
            if (!res.ok) return { balances: [] };
            return await res.json();
        },
        enabled: !!resolvedEventId && isAuthenticated,
        staleTime: 5000,
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


    // Refetch when switching to sell tab
    useEffect(() => {
        if (selectedTab === 'sell') {
            refetchBalances();
        }
    }, [selectedTab, refetchBalances]);

    // Calculate initial prices from event data on mount and updates
    useEffect(() => {
        if (eventData) {
            // Priority 1: Live prices (WS/dynamic)
            if (eventData.yesPrice != null || eventData.noPrice != null) {
                if (eventData.yesPrice != null) setYesPrice(eventData.yesPrice);
                if (eventData.noPrice != null) setNoPrice(eventData.noPrice);
            }
            // Priority 2: Outcomes array (Polymarket structure)
            else if (eventData.outcomes && Array.isArray(eventData.outcomes)) {
                const yesOutcome = eventData.outcomes.find((o: any) => /^yes$/i.test(o.name));
                const noOutcome = eventData.outcomes.find((o: any) => /^no$/i.test(o.name));

                if (yesOutcome && yesOutcome.probability != null) {
                    const p = yesOutcome.probability > 1 ? yesOutcome.probability / 100 : yesOutcome.probability;
                    setYesPrice(p);
                }
                if (noOutcome && noOutcome.probability != null) {
                    const p = noOutcome.probability > 1 ? noOutcome.probability / 100 : noOutcome.probability;
                    setNoPrice(p);
                }

                // If only one side found, derive the other for binary
                if (yesOutcome && !noOutcome) setNoPrice(1 - (yesOutcome.probability > 1 ? yesOutcome.probability / 100 : yesOutcome.probability));
                if (noOutcome && !yesOutcome) setYesPrice(1 - (noOutcome.probability > 1 ? noOutcome.probability / 100 : noOutcome.probability));
            }
            // Priority 3: Direct odds columns (DB fallback)
            else if (eventData.yesOdds != null && eventData.noOdds != null) {
                setYesPrice(eventData.yesOdds);
                setNoPrice(eventData.noOdds);
            }
        }
    }, [eventData]);



    // Fetch latest odds history to seed prices with freshest point (matches EventCard logic)
    const { data: latestHistory } = useQuery({
        queryKey: ['odds-history-latest', eventId],
        enabled: Boolean(eventId),
        staleTime: 15_000,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            const res = await fetch(`/api/events/${eventId}/odds-history?period=all`, { signal, cache: 'no-store' });
            if (!res.ok) return [];
            const json = await res.json();
            return Array.isArray(json?.data) ? json.data : [];
        },
    });

    // Seed prices from latest odds history when available
    useEffect(() => {
        if (!latestHistory || latestHistory.length === 0) return;
        const last = latestHistory[latestHistory.length - 1];

        // Handle outcomes array in history (Polymarket style)
        if (last.outcomes && Array.isArray(last.outcomes)) {
            const yesOutcome = last.outcomes.find((o: any) => o.name === 'Yes' || o.id === 'YES');
            if (yesOutcome && yesOutcome.probability != null) {
                const p = yesOutcome.probability > 1 ? yesOutcome.probability / 100 : yesOutcome.probability;
                setYesPrice(p);
                setNoPrice(1 - p);
                return;
            }
        }

        // Handle direct price fields
        const latestYes = typeof last?.yesPrice === 'number' ? last.yesPrice : undefined;
        const latestNo = typeof last?.noPrice === 'number' ? last.noPrice : undefined;

        if (latestYes != null) {
            setYesPrice(latestYes);
            if (latestNo == null) setNoPrice(1 - latestYes);
        }
        if (latestNo != null) {
            setNoPrice(latestNo);
            if (latestYes == null) setYesPrice(1 - latestNo);
        }
    }, [latestHistory]);

    // Find balance for the selected outcome
    // For binary events, tokenSymbol is `YES_${resolvedEventId}` or `NO_${resolvedEventId}`
    const expectedTokenSymbol = `${selectedOption}_${resolvedEventId}`;

    const userBalanceEntry = balanceData?.balances?.find((b: any) =>
        b.tokenSymbol === expectedTokenSymbol && b.eventId === resolvedEventId
    );

    // Fallback: match by eventId and tokenSymbol starting with selectedOption
    const userTokensForOutcome = userBalanceEntry ? parseFloat(userBalanceEntry.amount) : parseFloat(
        balanceData?.balances?.find((b: any) =>
            b.eventId === resolvedEventId && b.tokenSymbol?.startsWith(selectedOption)
        )?.amount || '0'
    );
    const toNum = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const availableShares = toNum(userTokensForOutcome);

    // Stablecoin balance (TUSD) for buy-side percentage slider
    const stablecoinBalance = toNum(
        balanceData?.balance ||
        balanceData?.balances?.find((b: any) => b.tokenSymbol === 'TUSD')?.amount
    );

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
        const channel = socket.subscribe(`event-${resolvedEventId}`);

        const handler = (update: any) => {
            if (update.eventId !== resolvedEventId) return;

            // Handle direct price updates
            if (update.yesPrice !== undefined) {
                const p = update.yesPrice > 1 ? update.yesPrice / 100 : update.yesPrice;
                setYesPrice(p);
                if (update.noPrice === undefined) setNoPrice(1 - p);
            }
            if (update.noPrice !== undefined) {
                const p = update.noPrice > 1 ? update.noPrice / 100 : update.noPrice;
                setNoPrice(p);
                if (update.yesPrice === undefined) setYesPrice(1 - p);
            }

            // Handle updates via outcomes array (common for Polymarket events)
            if (update.outcomes && Array.isArray(update.outcomes)) {
                const yesOutcome = update.outcomes.find((o: any) => o.name === 'Yes' || o.id === 'YES');
                const noOutcome = update.outcomes.find((o: any) => o.name === 'No' || o.id === 'NO');

                if (yesOutcome && yesOutcome.probability != null) {
                    const p = yesOutcome.probability > 1 ? yesOutcome.probability / 100 : yesOutcome.probability;
                    setYesPrice(p);
                    // If no explicit No outcome, assume 1-p
                    if (!noOutcome) setNoPrice(1 - p);
                }

                if (noOutcome && noOutcome.probability != null) {
                    const p = noOutcome.probability > 1 ? noOutcome.probability / 100 : noOutcome.probability;
                    setNoPrice(p);
                    // If no explicit Yes outcome, assume 1-p
                    if (!yesOutcome) setYesPrice(1 - p);
                }
            }
        };

        channel.bind('odds-update', handler);

        return () => {
            channel.unbind('odds-update', handler);
            socket.unsubscribe(`event-${resolvedEventId}`);
        };
    }, [resolvedEventId]);

    // Handle Enter key to confirm trade in dialog
    useEffect(() => {
        if (!showConfirmDialog) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeTrade();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showConfirmDialog]);


    // Prices are probabilities (0-1), convert to percentages
    // Handle edge cases and ensure valid probabilities. 
    // Do not use || 0.5 which breaks 0% outcomes.
    const safeYesPrice = Math.max(0, Math.min(1, yesPrice !== undefined ? yesPrice : 0.5));
    const safeNoPrice = Math.max(0, Math.min(1, noPrice !== undefined ? noPrice : 0.5));

    const yesProbability = (safeYesPrice * 100).toFixed(1);
    const noProbability = (safeNoPrice * 100).toFixed(1);

    // Calculate odds from prices (decimal odds = 1 / price)
    const yesOdds = yesPrice > 0 ? (1 / yesPrice) : 1;
    const noOdds = noPrice > 0 ? (1 / noPrice) : 1;

    // Calculate potential payout for current amount
    const currentAmount = parseFloat(amount) || 0;
    const currentPrice = orderType === 'limit' && price ? parseFloat(price) : (selectedOption === 'YES' ? yesPrice : noPrice);

    // For buy: payout = amount_spent / (price * (1 + markup)) = shares received
    // For sell: payout = amount_shares * (price * (1 - markup)) = USD received
    const potentialPayout = selectedTab === 'buy'
        ? currentAmount / (currentPrice * (1 + PLATFORM_MARKUP)) // Net Shares received
        : currentAmount * (currentPrice * (1 - PLATFORM_MARKUP)); // Net USD received

    // Profit calculation (only meaningful for buy orders)
    const potentialProfit = selectedTab === 'buy' ? potentialPayout - currentAmount : 0;

    const tradeMutation = useMutation({
        mutationFn: async () => {
            if (!resolvedEventId) {
                throw new Error('Missing event id');
            }

            const res = await fetch("/api/hybrid-trading", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventId: resolvedEventId,
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
                const errorMessage = error.error || 'Trade failed';

                // For rate-limit/cooldown errors, return a soft error instead of throwing
                // This prevents console.error spam for expected behavior
                if (res.status === 429 || errorMessage.toLowerCase().includes('cooldown') || errorMessage.toLowerCase().includes('wait')) {
                    return { __error: true, message: errorMessage, isCooldown: true };
                }

                throw new Error(errorMessage);
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
            track('Bet', {
                side: selectedTab,
                option: selectedOption,
                amount: parseFloat(amount),
                price: result.averagePrice,
                eventId: eventId,
                totalFilled: result.totalFilled
            });

            // Trigger success confetti animation from the trade button
            triggerConfetti(tradeButtonRef);

            return result;
        },
        onSuccess: (data) => {
            // Handle soft errors (cooldown) that were returned instead of thrown
            if (data?.__error && data?.isCooldown) {
                const { title, description, variant } = getUserFriendlyError(new Error(data.message));
                toast({ variant, title, description });
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

        // Check authentication
        if (!isAuthenticated) {
            toast({
                variant: 'info',
                title: '🔐 Sign in required',
                description: 'You need to be logged in to place trades.',
            });
            return;
        }

        const amountNum = parseFloat(amount);
        const MIN_BET = 0.10;
        const MAX_BET = 10000;

        // Check minimum bet
        if (amountNum < MIN_BET) {
            const { title, description, variant } = getMinimumBetError(MIN_BET);
            toast({ variant, title, description });
            return;
        }

        // Check maximum bet
        if (amountNum > MAX_BET) {
            const { title, description, variant } = getMaximumBetError(MAX_BET);
            toast({ variant, title, description });
            return;
        }

        // For buy orders, check balance
        if (selectedTab === 'buy' && stablecoinBalance > 0) {
            if (amountNum > stablecoinBalance) {
                const { title, description, variant } = getBalanceError(stablecoinBalance, amountNum);
                toast({ variant, title, description });
                return;
            }
        }

        // For sell orders, check if user has enough shares
        if (selectedTab === 'sell') {
            if (amountNum > availableShares) {
                toast({
                    variant: 'warning',
                    title: '💰 Insufficient Position',
                    description: `You only have ${availableShares.toFixed(2)} shares of ${selectedOption}. Please reduce your sell amount to ${availableShares.toFixed(2)} or less.`,
                });
                return;
            }
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

    const containerClass =
        variant === 'modal'
            ? "bg-transparent"
            : "bg-zinc-800 rounded-xl border border-white/10 overflow-hidden shadow-2xl";

    const contentPadding = variant === 'modal' ? 'p-5 space-y-5' : 'p-4 space-y-4';

    return (
        <div className={cn(
            "flex flex-col h-full bg-[#1a1d28] rounded-2xl border border-white/10 overflow-hidden",
            variant === 'modal' && "bg-transparent border-none"
        )}>
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

            <div className={cn("flex-1 p-3 space-y-3 overflow-y-auto no-scrollbar", variant === 'modal' && "p-0")}>
                {/* Outcome Selector */}
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
                        <div className="flex flex-col items-center">
                            <span className={cn("text-sm font-bold", selectedOption === 'YES' && "text-emerald-400")}>YES</span>
                            <span className="text-xs text-gray-400">{yesProbability}%</span>
                        </div>
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
                        <div className="flex flex-col items-center">
                            <span className={cn("text-sm font-bold", selectedOption === 'NO' && "text-rose-400")}>NO</span>
                            <span className="text-xs text-gray-400">{noProbability}%</span>
                        </div>
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
                                    : <><span className="text-gray-400 font-normal">Max:</span> {availableShares.toFixed(2)} shares</>
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
                                                setAmount(((parseFloat(amount) || 0) + increment).toString());
                                            }
                                        }}
                                        className="flex-1 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                                    >
                                        {val}
                                    </button>
                                ))
                            ) : (
                                // Sell presets: percentage of shares
                                ['25%', '50%', 'ALL'].map((val) => (
                                    <button
                                        key={val}
                                        onClick={() => {
                                            if (val === 'ALL') {
                                                setAmount(availableShares.toString());
                                            } else {
                                                const percentage = parseFloat(val.replaceAll('%', '')) / 100;
                                                setAmount((availableShares * percentage).toString());
                                            }
                                        }}
                                        className="flex-1 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                                        disabled={availableShares === 0}
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
                                onFocus={() => setAmountInputFocused(true)}
                                onBlur={() => setAmountInputFocused(false)}
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

                        {/* Payout Display */}
                        {/* Payout Display */}
                        {currentAmount > 0 && (
                            <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Avg. Price</span>
                                    <span className="text-white font-bold">
                                        {currentPrice.toFixed(4)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Estimated Payout</span>
                                    <span className="text-emerald-400 font-bold">
                                        {potentialPayout.toFixed(2)} USD
                                    </span>
                                </div>
                                <div className="pt-2 border-t border-white/5 flex justify-between text-sm">
                                    <span className="text-gray-300 font-bold uppercase tracking-tighter">Total Cost</span>
                                    <span className="text-white font-black">
                                        {currentAmount.toFixed(2)} {selectedTab === 'buy' ? 'USD' : 'Shares'}
                                    </span>
                                </div>
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
                                        onFocus={() => setPriceInputFocused(true)}
                                        onBlur={() => setPriceInputFocused(false)}
                                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all text-lg"
                                        placeholder="0.50"
                                        step="0.01"
                                        min="0.01"
                                        max="0.99"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                </div>
                                <div className="text-xs text-gray-500 font-medium">
                                    Market: ${(selectedOption === 'YES' ? yesPrice : noPrice).toFixed(2)}
                                </div>
                            </div>
                        )}

                    </div>

                </div>

                {/* Trade Button or Register/Deposit Button */}
                {!isAuthenticated ? (
                    <button
                        onClick={() => {
                            const url = new URL(window.location.href);
                            url.searchParams.set('auth', 'signup');
                            window.history.pushState({}, '', url.toString());
                            // Dispatch an event so Navbar can pick up the change if needed
                            window.dispatchEvent(new PopStateEvent('popstate'));
                        }}
                        className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-300 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-xl shadow-blue-500/20"
                    >
                        Register
                    </button>
                ) : (isAuthenticated && !isBalanceLoading && stablecoinBalance < 1 && selectedTab === 'buy') ? (
                    <button
                        onClick={() => setIsDepositModalOpen(true)}
                        className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-300 bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-500 hover:to-green-500"
                    >
                        Deposit Funds
                    </button>
                ) : (
                    <button
                        ref={tradeButtonRef}
                        onClick={handleTrade}
                        disabled={
                            isLoading ||
                            !amount ||
                            parseFloat(amount) <= 0 ||
                            (orderType === 'limit' && (!price || parseFloat(price) <= 0 || parseFloat(price) >= 1))
                        }
                        className={cn(
                            "w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-300 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedTab === 'buy'
                                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20"
                                : "bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500 shadow-red-500/20"
                        )}
                    >
                        {isLoading ? (
                            <div className="flex items-center justify-center gap-2">
                                <LoadingSpinner className="w-5 h-5 text-white" />
                                <span>Processing...</span>
                            </div>
                        ) : (
                            <span>{selectedTab === 'buy' ? 'Buy' : 'Sell'} {selectedOption} Tokens</span>
                        )}
                    </button>
                )}

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
                            className="bg-zinc-800 border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/20">
                                        <AlertTriangle className="w-5 h-5 text-blue-400" />
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
                                    <span className="font-bold text-blue-400">
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
                                    className="flex-1 py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all"
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

            {/* Deposit Modal */}
            <EnhancedDepositModal
                isOpen={isDepositModalOpen}
                onClose={() => setIsDepositModalOpen(false)}
                onBalanceUpdate={refetchBalances}
            />

            {/* Success Confetti Animation */}
            <SuccessConfetti
                isActive={showConfetti}
                originX={originX}
                originY={originY}
                onComplete={onConfettiComplete}
                duration={1200}
            />
        </div>
    );
}
