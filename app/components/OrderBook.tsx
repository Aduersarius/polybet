'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-end mb-2">
                <div className="flex bg-white/5 rounded-lg border border-white/10 p-1 overflow-x-auto max-w-xs">
                    {isMultiple ? (
                        outcomes.map((outcome) => (
                            <motion.button
                                key={outcome.id}
                                onClick={() => setSelectedOutcomeId(outcome.id)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={`px-2 py-1 text-xs font-medium rounded transition-all whitespace-nowrap ${selectedOutcomeId === outcome.id
                                    ? 'bg-[#bb86fc]/20 text-[#bb86fc] border border-[#bb86fc]/30 shadow-lg shadow-[#bb86fc]/20'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
                                    }`}
                            >
                                {outcome.name}
                            </motion.button>
                        ))
                    ) : (
                        <>
                            <motion.button
                                onClick={() => setSelectedOutcomeId('YES')}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={`px-3 py-1 text-xs font-medium rounded transition-all ${selectedOutcomeId === 'YES'
                                    ? 'bg-[#03dac6]/20 text-[#03dac6] border border-[#03dac6]/30 shadow-lg shadow-[#03dac6]/20'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
                                    }`}
                            >
                                YES
                            </motion.button>
                            <motion.button
                                onClick={() => setSelectedOutcomeId('NO')}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={`px-3 py-1 text-xs font-medium rounded transition-all ${selectedOutcomeId === 'NO'
                                    ? 'bg-[#cf6679]/20 text-[#cf6679] border border-[#cf6679]/30 shadow-lg shadow-[#cf6679]/20'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
                                    }`}
                            >
                                NO
                            </motion.button>
                        </>
                    )}
                </div>
            </div>
            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {/* Asks (Sell Orders) */}
                <div className="border-b border-white/10">
                    <div className="px-3 py-2 bg-red-500/10">
                        <div className="text-xs text-red-400 font-medium">Asks (Sell)</div>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                        {orderBook.asks.slice(0, 8).map((ask, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                className="flex justify-between px-3 py-1 text-xs hover:bg-white/5 transition-all duration-200 hover:bg-green-500/10"
                            >
                                <motion.span
                                    className="text-red-400 font-mono"
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
                                >
                                    ${(ask.price * 100).toFixed(1)}
                                </motion.span>
                                <motion.span
                                    className="text-gray-300 font-mono"
                                    animate={{ opacity: [0.7, 1, 0.7] }}
                                    transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", delay: index * 0.2 }}
                                >
                                    {ask.amount.toFixed(0)}
                                </motion.span>
                            </motion.div>
                        ))}
                        {orderBook.asks.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">No asks</div>
                        )}
                    </div>
                </div>

                {/* Bids (Buy Orders) */}
                <div>
                    <div className="px-3 py-2 bg-green-500/10">
                        <div className="text-xs text-green-400 font-medium">Bids (Buy)</div>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                        {orderBook.bids.slice(0, 8).map((bid, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                className="flex justify-between px-3 py-1 text-xs hover:bg-white/5 transition-all duration-200 hover:bg-green-500/10"
                            >
                                <motion.span
                                    className="text-green-400 font-mono"
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", delay: index * 0.1 }}
                                >
                                    ${(bid.price * 100).toFixed(1)}
                                </motion.span>
                                <motion.span
                                    className="text-gray-300 font-mono"
                                    animate={{ opacity: [0.7, 1, 0.7] }}
                                    transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", delay: index * 0.3 }}
                                >
                                    {bid.amount.toFixed(0)}
                                </motion.span>
                            </motion.div>
                        ))}
                        {orderBook.bids.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">No bids</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}