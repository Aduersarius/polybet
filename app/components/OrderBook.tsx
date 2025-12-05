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
}

export function OrderBook({ eventId, selectedOption: initialOption = 'YES', outcomes = [], eventType = 'BINARY' }: OrderBookProps) {
    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(outcomes[0]?.id || 'YES');
    const [orderBook, setOrderBook] = useState<{ bids: Array<{ price: number, amount: number }>, asks: Array<{ price: number, amount: number }> }>({ bids: [], asks: [] });

    const isMultiple = eventType === 'MULTIPLE';
    const selectedOption = isMultiple ? selectedOutcomeId : (selectedOutcomeId as 'YES' | 'NO');

    // Fetch initial order book data
    useEffect(() => {
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
    }, [eventId, selectedOutcomeId, isMultiple, selectedOption]);

    // Real-time updates via WebSocket
    useEffect(() => {
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
    }, [eventId, selectedOutcomeId, isMultiple, selectedOption]);

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
                    <div className="px-3 py-2 border-b border-white/5 bg-red-500/[0.05] flex justify-between items-center">
                        <span className="text-[10px] font-medium text-red-400">Asks</span>
                        <span className="text-[10px] text-gray-500">Price / Amt</span>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-none space-y-[1px] p-1">
                        <AnimatePresence initial={false}>
                            {orderBook.asks.map((ask, index) => (
                                <div key={`ask-${index}`} className="relative group flex items-center justify-between px-2 py-1 rounded h-7">
                                    {/* Depth Bar */}
                                    <div
                                        className="absolute right-0 top-0 bottom-0 bg-red-500/10 rounded-l transition-all duration-300"
                                        style={{ width: `${(ask.amount / (maxAsk || 1)) * 100}%` }}
                                    />
                                    <span className="relative z-10 font-mono text-xs text-red-400 font-medium">
                                        {(ask.price * 100).toFixed(1)}¢
                                    </span>
                                    <span className="relative z-10 font-mono text-xs text-gray-400">
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
                    <div className="px-3 py-2 border-b border-white/5 bg-green-500/[0.05] flex justify-between items-center">
                        <span className="text-[10px] text-gray-500">Amt / Price</span>
                        <span className="text-[10px] font-medium text-green-400">Bids</span>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-none space-y-[1px] p-1">
                        <AnimatePresence initial={false}>
                            {orderBook.bids.map((bid, index) => (
                                <div key={`bid-${index}`} className="relative group flex items-center justify-between px-2 py-1 rounded h-7">
                                    {/* Depth Bar */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 bg-green-500/10 rounded-r transition-all duration-300"
                                        style={{ width: `${(bid.amount / (maxBid || 1)) * 100}%` }}
                                    />
                                    <span className="relative z-10 font-mono text-xs text-gray-400">
                                        {bid.amount.toFixed(0)}
                                    </span>
                                    <span className="relative z-10 font-mono text-xs text-green-400 font-medium">
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