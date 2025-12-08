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
    const spread = 0.12; // total spread around base price

    const bids: OrderBookState['bids'] = [];
    const asks: OrderBookState['asks'] = [];

    for (let i = 1; i <= numLevels; i++) {
        const levelOffset = (i / numLevels) * (spread / 2);
        const priceBid = Math.max(0.01, basePrice - levelOffset);
        const priceAsk = Math.min(0.99, basePrice + levelOffset);

        const baseSize = 50 + Math.random() * 150;
        const sizeFactor = (numLevels - i + 1) / numLevels; // larger near top of book

        bids.push({ price: priceBid, amount: baseSize * sizeFactor });
        asks.push({ price: priceAsk, amount: baseSize * sizeFactor });
    }

    return { bids, asks };
}

function jitterOrderBook(prev: OrderBookState, basePrice: number): OrderBookState {
    const jitterPrice = (p: number, isBid: boolean) => {
        const maxJitter = 0.01; // 1% jitter
        const delta = (Math.random() - 0.5) * 2 * maxJitter;
        const next = p + delta;
        if (isBid) {
            return Math.min(basePrice, Math.max(0.01, next));
        }
        return Math.max(basePrice, Math.min(0.99, next));
    };

    const jitterSize = (a: number) => {
        const maxFactor = 0.1;
        const factor = 1 + (Math.random() - 0.5) * 2 * maxFactor;
        return Math.max(10, a * factor);
    };

    return {
        bids: prev.bids.map(b => ({ price: jitterPrice(b.price, true), amount: jitterSize(b.amount) })),
        asks: prev.asks.map(a => ({ price: jitterPrice(a.price, false), amount: jitterSize(a.amount) })),
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

        const id = setInterval(() => {
            setOrderBook(prev => jitterOrderBook(prev, basePrice));
        }, 1500);

        return () => clearInterval(id);
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

        const id = setInterval(() => {
            setOrderBook(prev => {
                // If no real data yet, don't jitter
                if (prev.bids.length === 0 && prev.asks.length === 0) return prev;
                const basePrice = getBasePriceFromOrderBook(prev);
                return jitterOrderBook(prev, basePrice);
            });
        }, 1500);

        return () => clearInterval(id);
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