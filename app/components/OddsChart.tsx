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
    ReferenceLine,
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
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#F43F5E', // Rose
    '#84CC16', // Lime
    '#D946EF', // Fuchsia
    '#06B6D4', // Cyan
];

// Time period options
const TIME_PERIODS = [
    { label: '6H', value: '6h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1m' },
    { label: '3M', value: '3m' },
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
    const [hoveredDataPoint, setHoveredDataPoint] = useState<any>(null);
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
                    const outcomeMatch = d.outcomes?.find((o) => o.id === outcome.id);
                    baseData[`outcome_${outcome.id}`] = (outcomeMatch?.probability || 0) * 100;
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

    // Get current values for legend - use the last data point from chart
    // This ensures legend matches what the chart actually shows
    const currentValues = useMemo(() => {
        if (isMultipleOutcomes && chartData.length > 0) {
            // Use the last point in chart data (consistent with chart display)
            const lastPoint = chartData[chartData.length - 1];
            const values: any = {};
            coloredOutcomes.forEach((outcome) => {
                values[`outcome_${outcome.id}`] = lastPoint[`outcome_${outcome.id}`] || 0;
            });
            return values;
        }
        return {};
    }, [chartData, coloredOutcomes, isMultipleOutcomes]);

    // Custom Timeline Tick for X-Axis (dots and labels above the line)
    const CustomTimelineTick = (props: any) => {
        const { x, y, payload } = props;
        const date = new Date(payload.value * 1000);

        // Format label based on period
        let label = '';
        if (period === '1h' || period === '6h') {
            label = format(date, 'h:mm a');
        } else if (period === '1d') {
            label = format(date, 'ha');
        } else if (period === '1w') {
            label = format(date, 'MMM d');
        } else if (period === '1m' || period === '3m' || period === 'all') {
            label = format(date, 'MMM d');
        } else {
            label = format(date, 'MMM');
        }

        return (
            <g transform={`translate(${x},${y})`}>
                {/* Label above the dot */}
                <text
                    x={0}
                    y={-20}
                    textAnchor="middle"
                    fill="#6B7280"
                    fontSize={11}
                >
                    {label}
                </text>
                {/* Dot on the timeline */}
                <circle
                    cx={0}
                    cy={-5}
                    r={4}
                    fill="#3B4048"
                    stroke="#4B5563"
                    strokeWidth={1}
                />
            </g>
        );
    };

    // Custom Cursor with Datetime Label at Top, Individual Tooltips, and Tint Overlay
    const CustomCursor = ({ points, payload, width, height, period: cursorPeriod, domain }: any) => {
        if (!points || points.length === 0 || !payload || payload.length === 0) return null;

        const x = points[0].x;
        const timestamp = payload[0]?.payload?.timestamp;
        if (!timestamp) return null;

        // Chart dimensions
        const chartWidth = width || 800;
        const chartHeight = height || 300;

        // Domain values for manual Y calculation
        const domainMin = domain?.[0] || 0;
        const domainMax = domain?.[1] || 100;
        const domainRange = domainMax - domainMin;

        // Format timestamp based on the current period
        const formatTimestamp = (ts: number) => {
            const date = new Date(ts * 1000);
            if (cursorPeriod === '1h' || cursorPeriod === '6h') {
                return format(date, 'h:mm a');
            } else if (cursorPeriod === '1d') {
                return format(date, 'MMM d, ha');
            } else if (cursorPeriod === '1w') {
                return format(date, 'MMM d, h a');
            } else if (cursorPeriod === '1m' || cursorPeriod === '3m') {
                return format(date, 'MMM d, yyyy');
            } else {
                return format(date, 'MMM d, yyyy h:mm a');
            }
        };

        const formattedDate = formatTimestamp(timestamp);


        // Get all data points with their Y positions - calculate manually from value
        let tooltipItems: Array<{ y: number, value: number, color: string, name: string }> = [];

        payload.forEach((item: any, index: number) => {
            const value = item.value || 0;

            // Calculate Y position manually based on domain
            // y = height - ((value - min) / range) * height
            const normalizedValue = (value - domainMin) / domainRange;
            // Clamp value between 0 and 1 to stay within chart area
            const clampedValue = Math.max(0, Math.min(1, normalizedValue));
            const y = chartHeight - (clampedValue * chartHeight);

            // Find outcome info for coloring
            let color = '#BB86FC';
            let name = 'Yes';

            if (isMultipleOutcomes) {
                const dataKey = item.dataKey as string;
                const outcomeId = dataKey?.replace('outcome_', '');
                const outcome = coloredOutcomes.find((o) => o.id === outcomeId);
                if (outcome) {
                    color = outcome.color;
                    name = outcome.name;
                }
            }

            tooltipItems.push({ y, value, color, name });
        });

        // Sort items by Y position (ascending - top to bottom)
        tooltipItems.sort((a, b) => a.y - b.y);

        // Prevent overlap
        const minDistance = 24; // Minimum distance between labels
        for (let i = 1; i < tooltipItems.length; i++) {
            const prev = tooltipItems[i - 1];
            const curr = tooltipItems[i];

            if (curr.y - prev.y < minDistance) {
                // Shift current item down
                curr.y = prev.y + minDistance;
            }
        }

        return (
            <g>
                {/* Tinted overlay for area after crosshair */}
                <rect
                    x={x}
                    y={0}
                    width={chartWidth - x}
                    height={chartHeight}
                    fill="rgba(30, 30, 30, 0.5)"
                    style={{ pointerEvents: 'none' }}
                />

                {/* Vertical crosshair line */}
                <line
                    x1={x}
                    y1={10}
                    x2={x}
                    y2={chartHeight}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                />

                {/* Datetime label moving with cursor */}
                <foreignObject x={x - 75} y={50} width={150} height={26}>
                    <div className="flex justify-center">
                        <div className="bg-[#1e1e1e]/90 border border-white/20 rounded px-2 py-0.5 text-[11px] font-medium text-gray-300 backdrop-blur-sm shadow-xl whitespace-nowrap">
                            {formattedDate}
                        </div>
                    </div>
                </foreignObject>

                {/* Individual tooltips for each line */}
                {tooltipItems.map((item, idx) => {
                    // Position tooltip exactly at the calculated Y coordinate, centered vertically
                    const tooltipY = item.y - 10;

                    return (
                        <foreignObject
                            key={idx}
                            x={x + 8}
                            y={tooltipY}
                            width={120} // Increased width for name
                            height={20}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}
                            >
                                <div
                                    style={{
                                        background: 'rgba(30, 30, 30, 0.95)',
                                        border: `1px solid ${item.color}50`,
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        backdropFilter: 'blur(4px)',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '6px',
                                            height: '6px',
                                            borderRadius: '50%',
                                            backgroundColor: item.color,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ color: '#E5E7EB', fontWeight: 500 }}>
                                        {item.name}
                                    </span>
                                    <span style={{ color: item.color, fontWeight: 700 }}>
                                        {item.value.toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        </foreignObject>
                    );
                })}
            </g>
        );
    };

    // Enhanced Tooltip - captures hovered data and updates legend
    const EnhancedTooltip = ({ active, payload }: any) => {
        // Update hovered data point for legend
        if (active && payload && payload.length > 0) {
            const dataPoint = payload[0]?.payload;
            if (dataPoint && dataPoint !== hoveredDataPoint) {
                // Use setTimeout to avoid state update during render
                setTimeout(() => setHoveredDataPoint(dataPoint), 0);
            }
        } else if (hoveredDataPoint !== null) {
            setTimeout(() => setHoveredDataPoint(null), 0);
        }

        // Return null - we show data in the legend and cursor instead
        return null;
    };

    // Custom Legend (Top) - Shows hovered values when hovering on chart
    const CustomLegend = () => {
        if (isMultipleOutcomes) {
            return (
                <div className="flex flex-wrap items-center gap-4">
                    {coloredOutcomes.map((outcome) => {
                        // Use hovered data point values if available, otherwise use current values
                        const value = hoveredDataPoint
                            ? (hoveredDataPoint[`outcome_${outcome.id}`] || 0)
                            : (currentValues[`outcome_${outcome.id}`] || 0);

                        return (
                            <motion.div
                                key={outcome.id}
                                className="flex items-center gap-2"
                            >
                                <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: outcome.color }}
                                />
                                <span className="text-xs font-medium text-gray-300">
                                    {outcome.name}
                                </span>
                                <span
                                    className="text-sm font-bold tabular-nums"
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

        // Binary event - show Yes value
        const binaryValue = hoveredDataPoint
            ? (hoveredDataPoint.value || 0)
            : ((currentYesPrice || 0) * 100);

        return (
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#BB86FC]" />
                    <span className="text-xs font-medium text-gray-300">Yes</span>
                    <span className="text-sm font-bold text-[#BB86FC] tabular-nums">
                        {Math.round(binaryValue)}%
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="relative h-full w-full bg-[#1e1e1e]">
            {/* Full-size Chart */}
            <div className="absolute inset-0">
                {isLoading && data.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#BB86FC]" />
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 0, right: 0, left: 0, bottom: 15 }}
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
                                tick={<CustomTimelineTick />}
                                tickLine={false}
                                axisLine={{ stroke: '#3B4048', strokeWidth: 2 }}
                                height={45}
                                tickMargin={0}
                                minTickGap={50}
                            />

                            <YAxis
                                orientation="right"
                                domain={yAxisDomain}
                                stroke="#6B7280"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                mirror={true}
                                tickCount={6}
                                tick={({ x, y, payload, index, visibleTicksCount }) => {
                                    // Hide first and last ticks
                                    if (index === 0 || index === visibleTicksCount - 1) return null;

                                    return (
                                        <text
                                            x={x}
                                            y={y}
                                            dy={4}
                                            textAnchor="end"
                                            fill="#6B7280"
                                            fontSize={11}
                                        >
                                            {payload.value}%
                                        </text>
                                    );
                                }}
                            />

                            <Tooltip
                                content={<EnhancedTooltip />}
                                cursor={<CustomCursor period={period} domain={yAxisDomain} />}
                                isAnimationActive={false}
                                animationDuration={0}
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

            {/* Overlay: Header with Legend and Time */}
            <div className="absolute top-3 left-4 right-4 flex items-start justify-between pointer-events-none">
                <div className="pointer-events-auto rounded-lg bg-[#1e1e1e]/80 backdrop-blur-sm px-3 py-2 flex flex-col items-end">
                    <CustomLegend />
                </div>
            </div>

            {/* Overlay: Bottom Controls */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none">
                {/* Time Period Buttons */}
                <div className="pointer-events-auto flex gap-1 rounded-lg bg-[#1e1e1e]/80 backdrop-blur-sm p-1">
                    {TIME_PERIODS.map((tp) => (
                        <motion.button
                            key={tp.value}
                            onClick={() => setPeriod(tp.value)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`rounded px-3 py-1 text-xs font-semibold transition-all ${period === tp.value
                                ? 'bg-[#BB86FC] text-white shadow-lg shadow-[#BB86FC]/30'
                                : 'text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {tp.label}
                        </motion.button>
                    ))}
                </div>

                {/* Utility Buttons -> Replaced with Watermark */}
                <div className="pointer-events-auto flex gap-1 rounded-lg bg-[#1e1e1e]/80 backdrop-blur-sm p-2">
                    <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity select-none">
                        <img
                            src="/diamond_logo_nobg.png"
                            alt="PolyBet"
                            className="h-6 w-6 object-contain"
                        />
                        <span className="text-xs font-bold tracking-wider bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            POLYBET
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}


