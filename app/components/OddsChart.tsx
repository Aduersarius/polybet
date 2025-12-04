'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Code, Settings } from 'lucide-react';

interface NewPolymarketChartProps {
    eventId: string;
    eventType: 'BINARY' | 'MULTIPLE';
    outcomes: Array<{ id: string; name: string; probability: number }>;
    liveOutcomes?: Array<{ id: string; name: string; probability: number }>;
    currentYesPrice?: number;
}

interface OutcomeData {
    id: string;
    name: string;
    probability: number;
    color: string;
}

interface DataPoint {
    timestamp: number;
    yesPrice?: number;
    outcomes?: OutcomeData[];
}

// PolyBet color palette from page elements
const OUTCOME_COLORS = [
    '#BB86FC', // Primary purple
    '#03DAC6', // Cyan/Teal  
    '#CF6679', // Pink/Red
    '#8B5CF6', // Secondary purple
    '#10B981', // Green
    '#F59E0B', // Orange
    '#3B82F6', // Blue
];

// Time period options
const TIME_PERIODS = [
    { label: '1H', value: '1h' },
    { label: '6H', value: '6h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1m' },
    { label: 'ALL', value: 'all' },
];

export function NewPolymarketChart({
    eventId,
    eventType,
    outcomes,
    liveOutcomes,
    currentYesPrice,
}: NewPolymarketChartProps) {
    const [period, setPeriod] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DataPoint[]>([]);
    const [hoveredOutcome, setHoveredOutcome] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Debug: Log received outcomes
    useEffect(() => {
        console.log('📊 Chart received outcomes:', outcomes);
        if (outcomes && outcomes.length > 0) {
            outcomes.forEach(o => {
                console.log(`  - ${o.name}: ${(o.probability * 100).toFixed(1)}%`);
            });
        }
    }, [outcomes]);

    // Update current time every minute
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    // Fetch historical data
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/events/${eventId}/odds-history?period=${period}`);
                const json = await res.json();
                const history = json.data || [];
                setData(history);
            } catch (e) {
                console.error('Failed to fetch odds history', e);
                setData([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [eventId, period]);

    // Real-time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');
        const isMultiple = eventType === 'MULTIPLE' && (liveOutcomes || outcomes) && (liveOutcomes || outcomes).length > 0;
        const handler = (update: any) => {
            if (update.eventId !== eventId) return;

            setData(prev => {
                const newDataPoint: DataPoint = {
                    timestamp: update.timestamp,
                    ...(isMultiple ? { outcomes: update.outcomes } : { yesPrice: update.yesPrice })
                };

                // Append new data point
                return [...prev, newDataPoint];
            });
        };

        socket.on(`odds-update-${eventId}`, handler);
        return () => {
            socket.off(`odds-update-${eventId}`, handler);
        };
    }, [eventId, eventType, liveOutcomes, outcomes]);


    // Use live outcomes if available, fallback to static outcomes
    const effectiveOutcomes = liveOutcomes || outcomes;

    // Determine if multiple outcomes
    const isMultipleOutcomes = eventType === 'MULTIPLE' && effectiveOutcomes && effectiveOutcomes.length > 0;

    // Assign colors to outcomes
    const coloredOutcomes = useMemo(() => {
        if (!isMultipleOutcomes) return [];
        return effectiveOutcomes.map((outcome, index) => ({
            ...outcome,
            color: OUTCOME_COLORS[index % OUTCOME_COLORS.length],
        }));
    }, [effectiveOutcomes, isMultipleOutcomes]);

    // Format data for Recharts - show historical data as lines
    const chartData = useMemo(() => {
        if (isMultipleOutcomes) {
            return data.map((d) => {
                const baseData: any = {
                    timestamp: d.timestamp,
                };
                // Add probability fields for each outcome
                coloredOutcomes.forEach((outcome) => {
                    const outcomeData = d.outcomes?.find((o) => o.id === outcome.id);
                    baseData[`outcome_${outcome.id}`] = (outcomeData?.probability || 0) * 100;
                });
                return baseData;
            });
        } else {
            return data.map((d) => ({
                timestamp: d.timestamp,
                value: (d.yesPrice || 0) * 100,
            }));
        }
    }, [data, isMultipleOutcomes, coloredOutcomes]);

    // Calculate Y-axis domain for autoscaling
    const yAxisDomain = useMemo(() => {
        if (chartData.length === 0) return [0, 100];

        let minValue = 100;
        let maxValue = 0;

        chartData.forEach((point) => {
            if (isMultipleOutcomes) {
                coloredOutcomes.forEach((outcome) => {
                    const value = point[`outcome_${outcome.id}`] || 0;
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                });
            } else {
                const value = point.value || 0;
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        });

        // Add padding (10% on each side)
        const range = maxValue - minValue;
        const padding = Math.max(range * 0.1, 5); // At least 5% padding

        return [
            Math.max(0, Math.floor(minValue - padding)),
            Math.min(100, Math.ceil(maxValue + padding)),
        ];
    }, [chartData, isMultipleOutcomes, coloredOutcomes]);

    // Get current values for legend - use outcomes prop (same as trading panel)
    const currentValues = useMemo(() => {
        if (isMultipleOutcomes) {
            // Use the outcomes prop directly (same source as trading panel)
            const values: any = {};
            coloredOutcomes.forEach((outcome) => {
                values[`outcome_${outcome.id}`] = (outcome.probability || 0) * 100;
            });
            console.log('📈 Chart legend values (from outcomes prop):', values);
            return values;
        }
        return {};
    }, [coloredOutcomes, isMultipleOutcomes]);

    // Custom Tooltip - Individual per line, no timestamp
    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload || !payload.length) return null;

        // Show only the first payload item (the line being hovered)
        const hoveredItem = payload[0];
        const dataPoint = hoveredItem.payload;
        if (!dataPoint.timestamp) return null;

        // Extract outcome info
        let outcomeName = 'Yes';
        let outcomeColor = '#BB86FC';
        let outcomeValue = hoveredItem.value;

        if (isMultipleOutcomes) {
            const dataKey = hoveredItem.dataKey as string;
            const outcomeId = dataKey.replace('outcome_', '');
            const outcome = coloredOutcomes.find((o) => o.id === outcomeId);
            if (outcome) {
                outcomeName = outcome.name;
                outcomeColor = outcome.color;
            }
        }

        return (
            <div className="rounded-lg border border-white/20 bg-[#1e1e1e]/95 px-2 py-1 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: outcomeColor }}
                    />
                    <span className="text-xs font-semibold text-white">
                        {outcomeName}:
                    </span>
                    <span className="text-xs font-bold" style={{ color: outcomeColor }}>
                        {outcomeValue.toFixed(1)}%
                    </span>
                </div>
            </div>
        );
    };

    // Custom Cursor with Datetime Label
    const CustomCursor = (props: any) => {
        const { points, width, height } = props;
        if (!points || points.length === 0) return null;

        const { x, payload } = points[0];
        if (!payload || !payload.timestamp) return null;

        return (
            <g>
                {/* Vertical line */}
                <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={height}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                />
                {/* Datetime label at top */}
                <g transform={`translate(${x}, -10)`}>
                    <rect
                        x={-50}
                        y={-18}
                        width={100}
                        height={20}
                        rx={4}
                        fill="#1e1e1e"
                        opacity={0.95}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth={1}
                    />
                    <text
                        x={0}
                        y={-4}
                        textAnchor="middle"
                        fill="#9CA3AF"
                        fontSize={10}
                        fontWeight={500}
                    >
                        {format(new Date(payload.timestamp * 1000), 'MMM d, h:mm a')}
                    </text>
                </g>
            </g>
        );
    };

    // Custom Legend (Top) - No background plates
    const CustomLegend = () => {
        if (isMultipleOutcomes) {
            return (
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    {coloredOutcomes.map((outcome) => {
                        const value = currentValues[`outcome_${outcome.id}`] || 0;
                        const isHovered = hoveredOutcome === outcome.id;

                        return (
                            <motion.div
                                key={outcome.id}
                                onHoverStart={() => setHoveredOutcome(outcome.id)}
                                onHoverEnd={() => setHoveredOutcome(null)}
                                whileHover={{ scale: 1.05 }}
                                className="flex items-center gap-2 cursor-pointer"
                            >
                                <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: outcome.color }}
                                />
                                <span className="text-xs font-medium text-gray-300">
                                    {outcome.name}
                                </span>
                                <span
                                    className="text-sm font-bold"
                                    style={{ color: outcome.color }}
                                >
                                    {Math.round(value)}%
                                </span>
                            </motion.div>
                        );
                    })}
                </div>
            );
        }

        return (
            <div className="mb-4 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#BB86FC]" />
                    <span className="text-xs font-medium text-gray-300">Yes</span>
                    <span className="text-sm font-bold text-[#BB86FC]">
                        {((currentYesPrice || 0) * 100).toFixed(0)}%
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col bg-[#1e1e1e] p-6">
            {/* Header with Legend and Time */}
            <div className="mb-4 flex items-start justify-between">
                <CustomLegend />
                <div className="text-xs text-gray-500">
                    {format(currentTime, 'MMM d, yyyy h:mm a')}
                </div>
            </div>

            {/* Chart */}
            <div className="flex-1">
                {isLoading && data.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#BB86FC]" />
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                            <defs>
                                {isMultipleOutcomes ? (
                                    coloredOutcomes.map((outcome) => (
                                        <linearGradient
                                            key={outcome.id}
                                            id={`gradient_${outcome.id}`}
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor={outcome.color}
                                                stopOpacity={0.3}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor={outcome.color}
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    ))
                                ) : (
                                    <linearGradient id="gradientValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                    </linearGradient>
                                )}
                            </defs>

                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(255,255,255,0.05)"
                                vertical={true}
                                horizontal={true}
                            />

                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(unixTime) => {
                                    const date = new Date(unixTime * 1000);
                                    if (period === '1h' || period === '6h') {
                                        return format(date, 'h:mm a');
                                    } else if (period === '1d') {
                                        return format(date, 'ha');
                                    } else {
                                        return format(date, 'MMM d');
                                    }
                                }}
                                stroke="#6B7280"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                            />

                            <YAxis
                                orientation="right"
                                domain={yAxisDomain}
                                stroke="#6B7280"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}%`}
                            />

                            <Tooltip
                                content={<CustomTooltip />}
                                cursor={<CustomCursor />}
                                isAnimationActive={false}
                                animationDuration={0}
                                shared={false}
                            />

                            {isMultipleOutcomes ? (
                                coloredOutcomes.map((outcome) => (
                                    <Area
                                        key={outcome.id}
                                        type="monotone"
                                        dataKey={`outcome_${outcome.id}`}
                                        stroke={outcome.color}
                                        strokeWidth={2.5}
                                        fill={`url(#gradient_${outcome.id})`}
                                        animationDuration={300}
                                        dot={false}
                                        activeDot={{
                                            r: 5,
                                            strokeWidth: 2,
                                            stroke: outcome.color,
                                            fill: '#1a1d29',
                                        }}
                                    />
                                ))
                            ) : (
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#8B5CF6"
                                    strokeWidth={2.5}
                                    fill="url(#gradientValue)"
                                    animationDuration={300}
                                    dot={false}
                                    activeDot={{
                                        r: 5,
                                        strokeWidth: 2,
                                        stroke: '#8B5CF6',
                                        fill: '#1a1d29',
                                    }}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Bottom Controls */}
            <div className="mt-4 flex items-center justify-between">
                {/* Time Period Buttons */}
                <div className="flex gap-1 rounded-lg bg-white/5 p-1">
                    {TIME_PERIODS.map((tp) => (
                        <motion.button
                            key={tp.value}
                            onClick={() => setPeriod(tp.value)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`rounded px-3 py-1 text-xs font-semibold transition-all ${period === tp.value
                                ? 'bg-[#BB86FC] text-white shadow-lg shadow-[#BB86FC]/30'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            {tp.label}
                        </motion.button>
                    ))}
                </div>

                {/* Utility Buttons */}
                <div className="flex gap-2">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="rounded-lg bg-white/5 p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                        title="Copy to clipboard"
                    >
                        <Copy size={16} />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="rounded-lg bg-white/5 p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                        title="View code"
                    >
                        <Code size={16} />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="rounded-lg bg-white/5 p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                        title="Settings"
                    >
                        <Settings size={16} />
                    </motion.button>
                </div>
            </div>
        </div>
    );
}
