'use client';

import React, { useEffect, useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { motion, useSpring, useTransform } from 'framer-motion';
import { format } from 'date-fns';

function AnimatedNumber({ value }: { value: number }) {
    const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
    const display = useTransform(spring, (current) => current.toFixed(1));

    useEffect(() => {
        spring.set(value);
    }, [value, spring]);

    return <motion.span>{display}</motion.span>;
}

interface OddsGraphProps {
    eventId: string;
    eventType?: string;
    outcomes?: OutcomeData[];
    currentYesPrice?: number; // Add current odds from event data
}

interface OutcomeData {
    id: string;
    name: string;
    probability: number;
    color?: string;
}

interface DataPoint {
    timestamp: number; // Unix seconds
    yesPrice: number; // probability 0-1 (for binary events)
    volume: number;
    outcomes?: OutcomeData[]; // for multiple events
}

// Custom Tooltip Component - Polymarket style with individual labels
const CustomTooltip = ({ active, payload, label, coordinate }: any) => {
    if (active && payload && payload.length > 0) {
        const formattedDate = format(new Date(label), 'MMM dd, yyyy h:mm a');

        return (
            <div className="relative" style={{ pointerEvents: 'none' }}>
                {/* Date label at top */}
                <div className="text-xs text-gray-400 mb-2">
                    {formattedDate}
                </div>

                {/* Individual floating labels for each line */}
                <div className="space-y-1">
                    {payload.map((entry: any, index: number) => (
                        <div
                            key={index}
                            className="px-2 py-1 rounded text-white text-xs font-bold shadow-lg whitespace-nowrap"
                            style={{
                                backgroundColor: entry.color
                            }}
                        >
                            {entry.name} {entry.value?.toFixed(1)}%
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export function OddsGraph({ eventId, eventType = 'BINARY', outcomes = [], currentYesPrice }: OddsGraphProps) {
    const [period, setPeriod] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [currentPrice, setCurrentPrice] = useState(currentYesPrice || 0.5); // Use prop or default to 50%

    const isMultiple = eventType === 'MULTIPLE';

    // Fetch historical data when period or event changes
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/events/${eventId}/odds-history?period=${period}`);
                const json = await res.json();

                // Transform data for Recharts
                const rawData = json.data || [];
                const transformedData = rawData.map((point: DataPoint) => {
                    const item: any = {
                        timestamp: point.timestamp * 1000, // Convert to ms for formatting
                        date: new Date(point.timestamp * 1000),
                    };

                    if (isMultiple && point.outcomes) {
                        point.outcomes.forEach(outcome => {
                            item[outcome.id] = outcome.probability * 100;
                        });
                    } else {
                        item.value = point.yesPrice * 100;
                        item.name = 'Yes';
                    }
                    return item;
                });

                setData(transformedData);

                // Note: We don't set currentPrice from historical data anymore
                // The current price should come from the currentYesPrice prop
                // Historical data is only used for charting
            } catch (e) {
                console.error('Failed to fetch odds history', e);
                setData([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [eventId, period, isMultiple]);

    // Update currentPrice if prop changes
    useEffect(() => {
        if (currentYesPrice !== undefined) {
            setCurrentPrice(currentYesPrice);
        }
    }, [currentYesPrice]);


    // Real‑time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');
        const handler = (update: any) => {
            if (update.eventId !== eventId) return;


            setData(prev => {
                const newItem: any = {
                    timestamp: update.timestamp * 1000,
                    date: new Date(update.timestamp * 1000),
                };

                if (isMultiple && update.outcomes) {
                    update.outcomes.forEach((outcome: any) => {
                        newItem[outcome.id] = outcome.probability * 100;
                    });
                } else {
                    newItem.value = update.yesPrice * 100;
                    newItem.name = 'Yes';
                    setCurrentPrice(update.yesPrice);
                }

                // Keep only last N points to avoid performance issues if needed,
                // but for now just append
                return [...prev, newItem];
            });
        };

        socket.on(`odds-update-${eventId}`, handler);
        return () => {
            socket.off(`odds-update-${eventId}`, handler);
        };
    }, [eventId, isMultiple]);

    const formatXAxis = (timestamp: number) => {
        const date = new Date(timestamp);
        if (period === '1h' || period === '5m') return format(date, 'HH:mm');
        if (period === '24h' || period === '1d') return format(date, 'HH:mm');
        return format(date, 'MMM dd');
    };

    return (
        <div className="material-card p-6">
            {/* Polymarket-style legend at top */}
            <div className="mb-4">
                {isMultiple ? (
                    <div className="flex flex-wrap gap-4 items-center">
                        {outcomes.map((outcome) => {
                            const latestData = data[data.length - 1];
                            const probability = latestData ? Math.round(latestData[outcome.id]) : Math.round(outcome.probability * 100 || 0);
                            return (
                                <div key={outcome.id} className="flex items-center gap-2 text-sm">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: outcome.color }}
                                    />
                                    <span className="text-gray-300">{outcome.name}</span>
                                    <span className="text-white font-bold">
                                        {probability}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div>
                        <div className="text-lg font-bold text-white mb-2">Probability Trend</div>
                        <div className="text-3xl font-bold text-purple-400 mb-1 transition-all duration-200 flex items-center gap-1">
                            <AnimatedNumber value={currentPrice * 100} />% chance
                        </div>
                    </div>
                )}
            </div>

            <div className="relative w-full h-[300px] mb-4">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatXAxis}
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value}%`}
                            padding={{ top: 20, bottom: 20 }}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                            animationDuration={0}
                            isAnimationActive={false}
                        />

                        {isMultiple ? (
                            outcomes.map((outcome) => (
                                <Line
                                    key={outcome.id}
                                    type="monotone"
                                    dataKey={outcome.id}
                                    name={outcome.name}
                                    stroke={outcome.color || '#8B5CF6'}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    isAnimationActive={false}
                                    connectNulls
                                />
                            ))
                        ) : (
                            <Line
                                type="monotone"
                                dataKey="value"
                                name="Yes"
                                stroke="#8B5CF6"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                isAnimationActive={false}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>

                {/* Custom watermark */}
                <div className="absolute bottom-2 left-2 text-base text-gray-500/20 font-bold pointer-events-none select-none">
                    PolyBet
                </div>

                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm rounded-lg z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                    </div>
                )}
            </div>

            <div className="flex gap-2 justify-between items-center mt-2">
                <div className="flex gap-2">
                    {['5m', '1h', '6h', '1d', 'all'].map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${period === p ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                        >
                            {p.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}