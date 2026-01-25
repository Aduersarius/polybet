'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Outcome {
    id: string;
    name: string;
    color?: string;
    price?: number;
    probability?: number;
}

interface OrderBookProps {
    eventId: string;
    selectedOption?: 'YES' | 'NO';
    outcomes?: Outcome[];
    eventType?: string;
    visualMode?: boolean;
    dataSource?: 'synthetic' | 'polymarket';
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

    const bids: OrderBookState['bids'] = [];
    const asks: OrderBookState['asks'] = [];

    let lastBidAmount = 20 + Math.random() * 20;
    let lastAskAmount = 20 + Math.random() * 20;

    let currentBidPrice = basePrice;
    let currentAskPrice = basePrice;

    for (let i = 1; i <= numLevels; i++) {
        // Dynamic tick: 0.1c (0.001) for pennies, 0.5c (0.005) otherwise
        const bidTick = (currentBidPrice <= 0.011) ? 0.001 : 0.005;
        const askTick = (currentAskPrice >= 0.989) ? 0.001 : 0.005;

        const priceBid = Math.max(0.001, currentBidPrice - bidTick);
        const priceAsk = Math.min(0.999, currentAskPrice + askTick);

        // Exponential growth with noise, but strictly >= previous level
        const growth = 1.2 + Math.random() * 0.3; // 20-50% growth per level
        const amountBid = lastBidAmount * growth;
        const amountAsk = lastAskAmount * growth;

        bids.push({ price: priceBid, amount: amountBid });
        asks.push({ price: priceAsk, amount: amountAsk });

        lastBidAmount = amountBid;
        lastAskAmount = amountAsk;
        currentBidPrice = priceBid;
        currentAskPrice = priceAsk;
    }

    return { bids, asks };
}

function jitterOrderBook(prev: OrderBookState, basePrice: number): OrderBookState {
    const numToUpdate = Math.floor(Math.random() * 3) + 2;
    const getWeight = (index: number) => Math.exp(-0.5 * index);
    const candidates: Array<{ side: 'bids' | 'asks'; index: number }> = [];

    let attempts = 0;
    while (candidates.length < numToUpdate && attempts < 100) {
        attempts++;
        const side = Math.random() < 0.5 ? 'bids' : 'asks';
        const index = Math.floor(Math.random() * prev[side].length);
        if (candidates.some(c => c.side === side && c.index === index)) continue;
        if (Math.random() < getWeight(index)) {
            candidates.push({ side, index });
        }
    }

    const nextBids = [...prev.bids];
    const nextAsks = [...prev.asks];

    candidates.forEach(c => {
        const sideArr = c.side === 'bids' ? nextBids : nextAsks;
        const factor = 1 + (Math.random() - 0.5) * 0.2;
        sideArr[c.index] = { ...sideArr[c.index], amount: Math.max(15, sideArr[c.index].amount * factor) };
    });

    // Enforce strict monotonicity: deeper rows must have >= volume than shallower rows
    for (let i = 1; i < nextBids.length; i++) {
        if (nextBids[i].amount < nextBids[i - 1].amount) {
            nextBids[i].amount = nextBids[i - 1].amount * (1 + Math.random() * 0.1);
        }
    }
    for (let i = 1; i < nextAsks.length; i++) {
        if (nextAsks[i].amount < nextAsks[i - 1].amount) {
            nextAsks[i].amount = nextAsks[i - 1].amount * (1 + Math.random() * 0.1);
        }
    }

    return { bids: nextBids, asks: nextAsks };
}

export function OrderBook({ eventId, selectedOption: initialOption = 'YES', outcomes = [], eventType = 'BINARY', visualMode = true, dataSource = 'synthetic', onOrderSelect }: OrderBookProps) {
    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(outcomes[0]?.id || initialOption);
    const [orderBook, setOrderBook] = useState<OrderBookState>({ bids: [], asks: [] });
    const [polymarketBook, setPolymarketBook] = useState<any>(null);
    const [liveOdds, setLiveOdds] = useState<{ yesOdds: number; noOdds: number; outcomePrices?: Record<string, number> } | null>(null);

    const isMultiple = eventType === 'MULTIPLE' || eventType === 'GROUPED_BINARY';
    const selectedOption = isMultiple ? selectedOutcomeId : (selectedOutcomeId as 'YES' | 'NO');

    const isYesSelected = useMemo(() => {
        if (selectedOutcomeId === 'YES') return true;
        if (selectedOutcomeId === 'NO') return false;
        const outcome = outcomes.find(o => o.id === selectedOutcomeId);
        return outcome?.name.toLowerCase() === 'yes';
    }, [selectedOutcomeId, outcomes]);

    // Sync default selection when outcomes load
    useEffect(() => {
        if (outcomes.length > 0) {
            const isValidSelection = outcomes.some(o => o.id === selectedOutcomeId);

            // If current selection is invalid, or it's the string 'YES' but the first outcome has a different ID
            if (!isValidSelection) {
                if (selectedOutcomeId === 'YES') {
                    // Try to find an outcome named "Yes" or just take the first one
                    const yesOutcome = outcomes.find(o => o.name.toLowerCase() === 'yes') || outcomes[0];
                    setSelectedOutcomeId(yesOutcome.id);
                } else if (selectedOutcomeId === 'NO') {
                    const noOutcome = outcomes.find(o => o.name.toLowerCase() === 'no') || outcomes[Math.min(1, outcomes.length - 1)];
                    setSelectedOutcomeId(noOutcome.id);
                } else {
                    // Total fallback
                    setSelectedOutcomeId(outcomes[0].id);
                }
            }
        }
    }, [outcomes]); // Only run when outcomes change

    // Fetch Polymarket orderbook
    useEffect(() => {
        if (dataSource === 'polymarket') {
            fetch(`/api/sports/orderbook?eventId=${eventId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        console.warn('[OrderBook] Polymarket fetch error:', data.error);
                        if (data.fallback) {
                            setPolymarketBook(data.fallback);
                            setLiveOdds({
                                yesOdds: data.fallback.yes.mid,
                                noOdds: data.fallback.no.mid
                            });
                        }
                    } else {
                        setPolymarketBook(data);
                        setLiveOdds({
                            yesOdds: data.yes.mid || 0.5,
                            noOdds: data.no.mid || 0.5
                        });

                        // Convert Polymarket data to orderbook format
                        const book = isYesSelected ? data.yes : data.no;
                        if (book && book.bids && book.asks) {
                            setOrderBook({
                                bids: book.bids.slice(0, 10).map((b: any) => ({
                                    price: typeof b === 'object' ? parseFloat(b.price || b[0]) : parseFloat(b),
                                    amount: typeof b === 'object' ? parseFloat(b.size || b[1]) : 100
                                })),
                                asks: book.asks.slice(0, 10).map((a: any) => ({
                                    price: typeof a === 'object' ? parseFloat(a.price || a[0]) : parseFloat(a),
                                    amount: typeof a === 'object' ? parseFloat(a.size || a[1]) : 100
                                }))
                            });
                        }
                    }
                })
                .catch(err => console.error('[OrderBook] Failed to fetch:', err));
        }
    }, [eventId, selectedOption, dataSource]);

    // Subscribe to SSE for real-time updates
    useEffect(() => {
        if (dataSource === 'polymarket') {
            const eventSource = new EventSource('/api/sports/probabilities/stream');

            eventSource.onmessage = (event) => {
                try {
                    const { updates } = JSON.parse(event.data);
                    const myUpdate = updates?.find((u: any) => u.eventId === eventId);

                    if (myUpdate) {
                        const outcomePrices: Record<string, number> = {};
                        if (myUpdate.outcomes) {
                            myUpdate.outcomes.forEach((o: any) => {
                                outcomePrices[o.id] = o.probability || o.price || 0.5;
                            });
                        }
                        setLiveOdds({
                            yesOdds: myUpdate.yesOdds,
                            noOdds: myUpdate.noOdds,
                            outcomePrices
                        });
                    }
                } catch (error) {
                    console.error('[OrderBook] SSE parse error:', error);
                }
            };

            eventSource.onerror = (error) => {
                console.error('[OrderBook] SSE error:', error);
                eventSource.close();
            };

            return () => eventSource.close();
        }
    }, [eventId, dataSource]);

    // Fetch initial order book data (disabled in visual mode and Polymarket mode)
    useEffect(() => {
        if (visualMode || dataSource === 'polymarket') return;
        const fetchOrderBook = async () => {
            try {
                // For multiple outcomes, selectedOption is actually a UUID (outcomeId)
                // For binary, selectedOption is 'YES' or 'NO'
                const params = isMultiple
                    ? `eventId=${eventId}&outcomeId=${selectedOption}`
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
    }, [eventId, selectedOutcomeId, isMultiple, selectedOption, visualMode, dataSource]);

    // Real-time updates via WebSocket (disabled in visual mode and Polymarket mode)
    useEffect(() => {
        if (visualMode || dataSource === 'polymarket') return;
        const { socket } = require('@/lib/socket');
        const channel = socket.subscribe(`event-${eventId}`);

        function onOrderbookUpdate(update: any) {
            if (update.eventId !== eventId) return;
            if (isMultiple && update.option !== selectedOutcomeId) return;
            if (!isMultiple && update.option !== selectedOption) return;
            setOrderBook({ bids: update.bids, asks: update.asks });
        }

        channel.bind('orderbook-update', onOrderbookUpdate);

        return () => {
            channel.unbind('orderbook-update', onOrderbookUpdate);
            socket.unsubscribe(`event-${eventId}`);
        };
    }, [eventId, selectedOutcomeId, isMultiple, selectedOption, visualMode, dataSource]);

    // Visual-only synthetic orderbook dynamics
    useEffect(() => {
        if (!visualMode) return;

        // Determine base price based on selection and available odds
        let basePrice = 0.4;

        // Try to find price in outcomes prop first (initial data)
        const outcomeFromProps = outcomes.find(o => o.id === selectedOutcomeId);
        const priceFromProps = outcomeFromProps?.price || outcomeFromProps?.probability;

        if (isMultiple) {
            const outcomePrice = liveOdds?.outcomePrices?.[selectedOutcomeId] ?? priceFromProps;
            if (outcomePrice !== undefined) {
                basePrice = outcomePrice;
            } else {
                // Fallback: vary by index so it's not "fixed" at 40% for all
                const idx = outcomes.findIndex(o => o.id === selectedOutcomeId);
                basePrice = idx >= 1 ? Math.max(0.1, 0.4 - (idx * 0.1)) : 0.4;
            }
        } else {
            if (isYesSelected) {
                basePrice = liveOdds?.yesOdds ?? priceFromProps ?? 0.4;
            } else {
                // For NO, use inverse of YES if available
                const yesPrice = liveOdds?.yesOdds ?? priceFromProps ?? 0.4;
                basePrice = liveOdds?.noOdds ?? (1 - yesPrice);
            }
        }

        setOrderBook(generateSyntheticOrderBook(basePrice));

        let timeoutId: NodeJS.Timeout | null = null;

        const scheduleNext = () => {
            timeoutId = setTimeout(() => {
                setOrderBook(prev => jitterOrderBook(prev, basePrice));
                scheduleNext();
            }, 5000); // Fixed 5 second interval
        };

        scheduleNext();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [visualMode, isMultiple, selectedOption, liveOdds, outcomes, selectedOutcomeId]);

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
            timeoutId = setTimeout(() => {
                setOrderBook(prev => {
                    // If no real data yet, don't jitter
                    if (prev.bids.length === 0 && prev.asks.length === 0) return prev;
                    const basePrice = getBasePriceFromOrderBook(prev);
                    return jitterOrderBook(prev, basePrice);
                });
                scheduleNext();
            }, 5000); // Fixed 5 second interval
        };

        scheduleNext();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [visualMode]);

    const maxAsk = useMemo(() => Math.max(...orderBook.asks.map(a => a.amount), 0), [orderBook.asks]);
    const maxBid = useMemo(() => Math.max(...orderBook.bids.map(b => b.amount), 0), [orderBook.bids]);

    return (
        <div className="flex flex-col h-full bg-[#1a1d28] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5 select-none">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex flex-col">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Order Book</h3>
                    {dataSource === 'polymarket' && liveOdds && (
                        <div className="text-[10px] text-blue-400 mt-0.5">
                            Live: {((isYesSelected ? liveOdds.yesOdds : liveOdds.noOdds) * 100).toFixed(1)}¢
                        </div>
                    )}
                </div>
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
                                onClick={() => {
                                    const yesId = outcomes.find(o => o.name.toLowerCase() === 'yes')?.id || 'YES';
                                    setSelectedOutcomeId(yesId);
                                }}
                                className={`px-3 py-1 text-[10px] font-medium rounded transition-all ${selectedOutcomeId === (outcomes.find(o => o.name.toLowerCase() === 'yes')?.id || 'YES')
                                    ? 'bg-[#03dac6]/20 text-[#03dac6] shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                YES
                            </button>
                            <button
                                onClick={() => {
                                    const noId = outcomes.find(o => o.name.toLowerCase() === 'no')?.id || 'NO';
                                    setSelectedOutcomeId(noId);
                                }}
                                className={`px-3 py-1 text-[10px] font-medium rounded transition-all ${selectedOutcomeId === (outcomes.find(o => o.name.toLowerCase() === 'no')?.id || 'NO')
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