'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Outcome {
    id: string;
    name: string;
    color?: string;
}

interface OrderBookProps {
    eventId: string;
    selectedOption?: 'YES' | 'NO';
    outcomes?: Outcome[];
    eventType?: string;
    visualMode?: boolean;
    onOrderSelect?: (intent: {
        side: 'buy' | 'sell';
        price: number;
        amount: number;
        outcomeId?: string; // For multiple
    }) => void;
}

type OrderBookState = { bids: Array<{ price: number; amount: number }>; asks: Array<{ price: number; amount: number }> };

function generateSyntheticOrderBook(basePrice: number): OrderBookState {
    const numLevels = 10;
    const tick = 0.005; // 0.5¢ price step for a clean ladder

    const bids: OrderBookState['bids'] = [];
    const asks: OrderBookState['asks'] = [];

    for (let i = 1; i <= numLevels; i++) {
        // Stable price ladder around base price
        const priceBid = Math.max(0.01, basePrice - tick * (i));
        const priceAsk = Math.min(0.99, basePrice + tick * (i));

        // Depth profile:
        // - top 2–3 levels are thick
        // - then decay quickly
        // - some deeper levels are effectively empty to create gaps
        const depthIndex = i - 1; // 0 is best level

        const topSize = 160 + Math.random() * 60; // base size near top
        const decayRate = 0.45; // stronger falloff for tree shape
        const decayFactor = Math.exp(-decayRate * depthIndex);

        // Random gaps deeper in the book
        const isDeep = depthIndex >= 5;
        const gapChance = isDeep ? 0.45 : 0.12;
        const isGap = Math.random() < gapChance;

        // Occasional big resting order deeper in the book
        const bigOrderBoost = !isGap && depthIndex >= 3 && Math.random() < 0.15
            ? 1.8 + Math.random() * 0.7
            : 1;

        const noiseBid = 1 + (Math.random() - 0.5) * 0.25;  // ±12.5%
        const noiseAsk = 1 + (Math.random() - 0.5) * 0.25;

        const baseAmount = isGap ? 0 : topSize * decayFactor * bigOrderBoost;
        const amountBid = Math.max(0, baseAmount * noiseBid);
        const amountAsk = Math.max(0, baseAmount * noiseAsk);

        bids.push({ price: priceBid, amount: amountBid });
        asks.push({ price: priceAsk, amount: amountAsk });
    }

    return { bids, asks };
}

function jitterOrderBook(prev: OrderBookState, basePrice: number): OrderBookState {
    // Only jitter sizes; keep prices fixed so ladder looks stable.
    const jitterSize = (a: number, index: number, side: 'bid' | 'ask') => {
        // Stronger movement near top-of-book, softer deeper in the book
        const isTop = index < 3;
        const baseMaxFactor = isTop ? 0.22 : 0.08;
        const factor = 1 + (Math.random() - 0.5) * 2 * baseMaxFactor;
        const minAmount = side === 'bid' ? 15 : 15;
        return Math.max(minAmount, a * factor);
    };

    return {
        bids: prev.bids.map((b, index) => {
            // Jitter mostly near top, occasionally deeper levels
            const shouldMove = index < 3 || Math.random() < 0.25;
            if (!shouldMove) return b;
            return { ...b, amount: jitterSize(b.amount, index, 'bid') };
        }),
        asks: prev.asks.map((a, index) => {
            const shouldMove = index < 3 || Math.random() < 0.25;
            if (!shouldMove) return a;
            return { ...a, amount: jitterSize(a.amount, index, 'ask') };
        }),
    };
}

export function OrderBook({ eventId, selectedOption: initialOption = 'YES', outcomes = [], eventType = 'BINARY', visualMode = false, onOrderSelect }: OrderBookProps) {
    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(outcomes[0]?.id || 'YES');
    const [orderBook, setOrderBook] = useState<OrderBookState>({ bids: [], asks: [] });

    const isMultiple = eventType === 'MULTIPLE';
    const selectedOption = isMultiple ? selectedOutcomeId : (selectedOutcomeId as 'YES' | 'NO');

    // Fetch initial order book data (disabled in visual mode)
    useEffect(() => {
        if (visualMode) return;
        const fetchOrderBook = async () => {
            try {
                const params = isMultiple
                    ? `eventId=${eventId}&outcomeId=${selectedOutcomeId}`
                    : `eventId=${eventId}&option=${selectedOption}`;
                const response = await fetch(`/api/order-book?${params}`);
                if (response.ok) {
                    const data = await response.json();
                    setOrderBook(data);
                }
            } catch (error) {
                console.error('Failed to fetch order book:', error);
            }
        };

        fetchOrderBook();
    }, [eventId, selectedOutcomeId, isMultiple, selectedOption, visualMode]);

    // Real-time updates via WebSocket (disabled in visual mode)
    useEffect(() => {
        if (visualMode) return;
        const { socket } = require('@/lib/socket');

        function onOrderbookUpdate(update: any) {
            if (update.eventId !== eventId) return;
            if (isMultiple && update.option !== selectedOutcomeId) return;
            if (!isMultiple && update.option !== selectedOption) return;
            setOrderBook({ bids: update.bids, asks: update.asks });
        }

        // Join event room for updates
        socket.emit('join-event', eventId);
        socket.emit('subscribe-orderbook', isMultiple ? { eventId, outcomeId: selectedOutcomeId } : { eventId, option: selectedOption });

        socket.on('orderbook-update', onOrderbookUpdate);

        return () => {
            socket.emit('leave-event', eventId);
            socket.emit('unsubscribe-orderbook', isMultiple ? { eventId, outcomeId: selectedOutcomeId } : { eventId, option: selectedOption });
            socket.off('orderbook-update', onOrderbookUpdate);
        };
    }, [eventId, selectedOutcomeId, isMultiple, selectedOption, visualMode]);

    // Visual-only synthetic orderbook dynamics
    useEffect(() => {
        if (!visualMode) return;

        const basePrice = isMultiple ? 0.5 : (selectedOption === 'YES' ? 0.6 : 0.4);
        setOrderBook(generateSyntheticOrderBook(basePrice));

        let timeoutId: NodeJS.Timeout | null = null;

        const scheduleNext = () => {
            // Random delay between ~0.3s and 1.8s, sometimes longer pause
            const baseDelay = 300 + Math.random() * 1500;
            const extraPause = Math.random() < 0.2 ? 600 + Math.random() * 800 : 0;
            const delay = baseDelay + extraPause;

            timeoutId = setTimeout(() => {
                setOrderBook(prev => jitterOrderBook(prev, basePrice));
                scheduleNext();
            }, delay);
        };

        scheduleNext();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [visualMode, isMultiple, selectedOption]);

    // Breathing effect on top of real data (when not in visual mode)
    useEffect(() => {
        if (visualMode) return;

        const getBasePriceFromOrderBook = (state: OrderBookState): number => {
            const bestBid = state.bids.length > 0 ? Math.max(...state.bids.map(b => b.price)) : 0.5;
            const bestAsk = state.asks.length > 0 ? Math.min(...state.asks.map(a => a.price)) : 0.5;
            if (bestBid === 0.5 && bestAsk === 0.5) return 0.5;
            return (bestBid + bestAsk) / 2;
        };

        let timeoutId: NodeJS.Timeout | null = null;

        const scheduleNext = () => {
            const baseDelay = 400 + Math.random() * 1600;
            const extraPause = Math.random() < 0.15 ? 800 + Math.random() * 600 : 0;
            const delay = baseDelay + extraPause;

            timeoutId = setTimeout(() => {
                setOrderBook(prev => {
                    // If no real data yet, don't jitter
                    if (prev.bids.length === 0 && prev.asks.length === 0) return prev;
                    const basePrice = getBasePriceFromOrderBook(prev);
                    return jitterOrderBook(prev, basePrice);
                });
                scheduleNext();
            }, delay);
        };

        scheduleNext();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [visualMode]);

    const maxAsk = useMemo(() => Math.max(...orderBook.asks.map(a => a.amount), 0), [orderBook.asks]);
    const maxBid = useMemo(() => Math.max(...orderBook.bids.map(b => b.amount), 0), [orderBook.bids]);

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5 select-none">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Order Book</h3>
                {/* Outcome Selector */}
                <div className="flex bg-black/20 rounded-lg p-0.5">
                    {isMultiple ? (
                        outcomes.map((outcome) => (
                            <button
                                key={outcome.id}
                                onClick={() => setSelectedOutcomeId(outcome.id)}
                                className={`px-2 py-1 text-[10px] font-medium rounded transition-all whitespace-nowrap ${selectedOutcomeId === outcome.id
                                    ? 'bg-[#bb86fc]/20 text-[#bb86fc] shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                {outcome.name}
                            </button>
                        ))
                    ) : (
                        <>
                            <button
                                onClick={() => setSelectedOutcomeId('YES')}
                                className={`px-3 py-1 text-[10px] font-medium rounded transition-all ${selectedOutcomeId === 'YES'
                                    ? 'bg-[#03dac6]/20 text-[#03dac6] shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                YES
                            </button>
                            <button
                                onClick={() => setSelectedOutcomeId('NO')}
                                className={`px-3 py-1 text-[10px] font-medium rounded transition-all ${selectedOutcomeId === 'NO'
                                    ? 'bg-[#cf6679]/20 text-[#cf6679] shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                NO
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex min-h-0 divide-x divide-white/5">
                {/* Asks (Sell) */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-3 py-2 border-b border-white/5 bg-[#CF6679]/10 flex justify-between items-center">
                        <span className="text-[10px] font-medium text-[#CF6679]">Asks</span>
                        <span className="text-[10px] text-gray-500">Price / Amt</span>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0 scrollbar-none space-y-[1px]">
                        <AnimatePresence initial={false}>
                            {orderBook.asks.map((ask, index) => (
                                <div
                                    key={`ask-${index}`}
                                    className="relative group flex items-center justify-between px-2 py-1 rounded flex-1 cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => onOrderSelect?.({
                                        side: 'buy', // Buying safely takes an ask
                                        price: ask.price,
                                        amount: ask.amount,
                                        outcomeId: selectedOutcomeId
                                    })}
                                >
                                    {/* Depth Bar */}
                                    <div
                                        className="absolute right-0 top-0 bottom-0 bg-[#CF6679]/15 rounded-l transition-all duration-300 pointer-events-none"
                                        style={{ width: `${(ask.amount / (maxAsk || 1)) * 100}%` }}
                                    />
                                    <span className="relative z-10 font-mono text-xs text-[#CF6679] font-medium pointer-events-none">
                                        {(ask.price * 100).toFixed(1)}¢
                                    </span>
                                    <span className="relative z-10 font-mono text-xs text-gray-400 pointer-events-none">
                                        {ask.amount.toFixed(0)}
                                    </span>
                                </div>
                            ))}
                            {orderBook.asks.length === 0 && (
                                <div className="p-4 text-center text-xs text-gray-600">No asks available</div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Bids (Buy) */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-3 py-2 border-b border-white/5 bg-[#10B981]/10 flex justify-between items-center">
                        <span className="text-[10px] text-gray-500">Amt / Price</span>
                        <span className="text-[10px] font-medium text-[#10B981]">Bids</span>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0 scrollbar-none space-y-[1px]">
                        <AnimatePresence initial={false}>
                            {orderBook.bids.map((bid, index) => (
                                <div
                                    key={`bid-${index}`}
                                    className="relative group flex items-center justify-between px-2 py-1 rounded flex-1 cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => onOrderSelect?.({
                                        side: 'sell', // Selling safely matches a bid
                                        price: bid.price,
                                        amount: bid.amount,
                                        outcomeId: selectedOutcomeId
                                    })}
                                >
                                    {/* Depth Bar */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 bg-[#10B981]/15 rounded-r transition-all duration-300 pointer-events-none"
                                        style={{ width: `${(bid.amount / (maxBid || 1)) * 100}%` }}
                                    />
                                    <span className="relative z-10 font-mono text-xs text-gray-400 pointer-events-none">
                                        {bid.amount.toFixed(0)}
                                    </span>
                                    <span className="relative z-10 font-mono text-xs text-[#10B981] font-medium pointer-events-none">
                                        {(bid.price * 100).toFixed(1)}¢
                                    </span>
                                </div>
                            ))}
                            {orderBook.bids.length === 0 && (
                                <div className="p-4 text-center text-xs text-gray-600">No bids available</div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}