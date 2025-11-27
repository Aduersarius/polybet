'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Brush,
    ReferenceArea,
} from 'recharts';
import { format } from 'date-fns';
import { motion, useSpring, useTransform } from 'framer-motion';

interface OddsChartProps {
    eventId: string;
}

interface DataPoint {
    timestamp: number;
    yesPrice: number;
    volume: number;
}

function AnimatedNumber({ value }: { value: number }) {
    const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
    const display = useTransform(spring, (current) => current.toFixed(1));

    useEffect(() => {
        spring.set(value);
    }, [value, spring]);

    return <motion.span>{display}</motion.span>;
}

export function OddsChart({ eventId }: OddsChartProps) {
    const [period, setPeriod] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DataPoint[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
    const [brushStartIndex, setBrushStartIndex] = useState<number>(0);
    const [brushEndIndex, setBrushEndIndex] = useState<number>(0);

    // Fetch historical data
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/events/${eventId}/odds-history?period=${period}`);
                const json = await res.json();
                const history = json.data || [];
                setData(history);
                if (history.length > 0) {
                    setCurrentPrice(history[history.length - 1].yesPrice);
                }
            } catch (e) {
                console.error('Failed to fetch odds history', e);
                setData([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [eventId, period]);

    // Real-time updates
    useEffect(() => {
        const { socket } = require('@/lib/socket');
        const handler = (update: any) => {
            if (update.eventId !== eventId) return;
            const newPoint: DataPoint = {
                timestamp: update.timestamp,
                yesPrice: update.yesPrice,
                volume: update.volume,
            };
            setData((prev) => {
                const newData = [...prev, newPoint];
                return newData;
            });
            setCurrentPrice(newPoint.yesPrice);
        };
        socket.on(`odds-update-${eventId}`, handler);
        return () => {
            socket.off(`odds-update-${eventId}`, handler);
        };
    }, [eventId]);

    // Format data for Recharts
    const chartData = useMemo(() => {
        return data.map((d) => ({
            ...d,
            formattedTime: new Date(d.timestamp * 1000).toLocaleTimeString(),
            value: d.yesPrice * 100, // Convert to percentage
        }));
    }, [data]);

    const displayPrice = (hoveredPrice !== null ? hoveredPrice : currentPrice || 0) * 100;

    // Safely determine if we should show the Brush
    const shouldShowBrush = useMemo(() => {
        if (chartData.length < 2) return false;

        // Check all timestamps are valid
        const allValid = chartData.every(d =>
            d.timestamp &&
            typeof d.timestamp === 'number' &&
            !isNaN(d.timestamp) &&
            d.value !== null &&
            d.value !== undefined &&
            !isNaN(d.value)
        );

        if (!allValid) return false;

        // Check we have a valid range
        const timestamps = chartData.map(d => d.timestamp);
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);

        return maxTime > minTime && isFinite(minTime) && isFinite(maxTime);
    }, [chartData]);

    // Update brush indices when data changes
    useEffect(() => {
        if (chartData.length > 0) {
            const start = Math.max(0, chartData.length - 60);
            const end = chartData.length - 1;
            setBrushStartIndex(start);
            setBrushEndIndex(end);
        }
    }, [chartData]);

    // Track hovered timestamp for tinting effect
    const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);

    // Calculate gradient offset for tinting effect
    const gradientOffset = useMemo(() => {
        if (hoveredTimestamp === null || chartData.length === 0) {
            return 100; // No tinting - full color
        }

        // Use the visible range (affected by Brush)
        const start = Math.max(0, brushStartIndex);
        const end = Math.min(chartData.length - 1, brushEndIndex);

        // If brush indices are invalid or inverted, fallback to full range
        if (start >= end) return 100;

        const visibleData = chartData.slice(start, end + 1);
        if (visibleData.length === 0) return 100;

        const minTime = visibleData[0].timestamp;
        const maxTime = visibleData[visibleData.length - 1].timestamp;
        const range = maxTime - minTime;

        if (range === 0) return 100;

        const offset = ((hoveredTimestamp - minTime) / range) * 100;
        return Math.max(0, Math.min(100, offset));
    }, [chartData, hoveredTimestamp, brushStartIndex, brushEndIndex]);

    // Custom Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length || !payload[0]?.payload) {
            return null;
        }

        const dataPoint = payload[0].payload;

        // Validate that we have valid data
        if (!dataPoint.timestamp || dataPoint.value == null) {
            return null;
        }

        return (
            <div className="rounded-lg border border-purple-500/30 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
                <div className="mb-1 text-sm font-medium text-gray-400">
                    {format(new Date(dataPoint.timestamp * 1000), period === '1d' || period === '1w' ? 'MMM d, h:mm a' : 'h:mm a')}
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-purple-500" />
                    <span className="text-lg font-bold text-white">
                        {dataPoint.value.toFixed(1)}% Yes
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="material-card p-6">
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <div className="mb-1 text-3xl font-bold text-purple-400 transition-all duration-200 flex items-center gap-1">
                        <AnimatedNumber value={displayPrice} />% <span className="text-lg text-gray-500">chance</span>
                    </div>

                </div>

                {/* Period Selectors */}
                <div className="flex gap-1 rounded-lg bg-white/5 p-1">
                    {['5m', '1h', '6h', '1d', 'all'].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`rounded px-3 py-1 text-xs font-medium transition-all ${period === p
                                ? 'bg-purple-500 text-white shadow-lg'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            {p.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[300px] w-full">
                {isLoading && data.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-500"></div>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            onMouseMove={(data: any) => {
                                if (data && data.activePayload && data.activePayload.length) {
                                    const payload = data.activePayload[0].payload;
                                    if (payload && payload.yesPrice != null) {
                                        setHoveredPrice(payload.yesPrice);
                                        setHoveredTimestamp(payload.timestamp);
                                    }
                                }
                            }}
                            onMouseLeave={() => {
                                setHoveredPrice(null);
                                setHoveredTimestamp(null);
                            }}
                            margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorValue" x1="0%" y1="0" x2="100%" y2="0">
                                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                    <stop offset={`${gradientOffset}%`} stopColor="#8B5CF6" stopOpacity={0.3} />
                                    <stop offset={`${gradientOffset}%`} stopColor="#6B7280" stopOpacity={0.15} />
                                    <stop offset="100%" stopColor="#6B7280" stopOpacity={0.15} />
                                </linearGradient>
                                <linearGradient id="strokeGradient" x1="0%" y1="0" x2="100%" y2="0">
                                    <stop offset="0%" stopColor="#8B5CF6" />
                                    <stop offset={`${gradientOffset}%`} stopColor="#8B5CF6" />
                                    <stop offset={`${gradientOffset}%`} stopColor="#6B7280" />
                                    <stop offset="100%" stopColor="#6B7280" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                vertical={true}
                                stroke="rgba(255,255,255,0.08)"
                                strokeDasharray="3 3"
                            />
                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                ticks={(() => {
                                    if (chartData.length === 0) return [];

                                    const minTime = chartData[0].timestamp;
                                    const maxTime = chartData[chartData.length - 1].timestamp;

                                    // Generate ticks at day boundaries (midnight)
                                    const ticks: number[] = [];
                                    let currentDate = new Date(minTime * 1000);

                                    // Round up to next midnight
                                    currentDate.setHours(0, 0, 0, 0);
                                    if (currentDate.getTime() / 1000 < minTime) {
                                        currentDate.setDate(currentDate.getDate() + 1);
                                    }

                                    // Add ticks for each day
                                    while (currentDate.getTime() / 1000 <= maxTime) {
                                        ticks.push(currentDate.getTime() / 1000);
                                        currentDate.setDate(currentDate.getDate() + 1);
                                    }

                                    // Always include first and last points if not too close to day boundaries
                                    if (ticks.length === 0 || ticks[0] - minTime > 3600) {
                                        ticks.unshift(minTime);
                                    }
                                    if (ticks.length === 0 || maxTime - ticks[ticks.length - 1] > 3600) {
                                        ticks.push(maxTime);
                                    }

                                    return ticks;
                                })()}
                                tickFormatter={(unixTime) => {
                                    const date = new Date(unixTime * 1000);
                                    // Check if it's a day boundary (midnight)
                                    const isDayBoundary = date.getHours() === 0 && date.getMinutes() === 0;

                                    if (isDayBoundary) {
                                        return format(date, 'MMM d');
                                    }

                                    // For short periods (<= 24h), show time
                                    if (period === '5m' || period === '1h' || period === '6h' || period === '1d') {
                                        return format(date, 'h:mm a');
                                    }
                                    // For longer periods ('all'), show date only
                                    return format(date, 'MMM d');
                                }}
                                stroke="#6B7280"
                                fontSize={12}
                                tickLine={true}
                                axisLine={false}
                            />
                            <YAxis
                                orientation="right"
                                domain={[0, 100]}
                                stroke="#6B7280"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}%`}
                            />
                            <Tooltip
                                content={<CustomTooltip />}
                                cursor={{ stroke: '#8B5CF6', strokeWidth: 1, strokeDasharray: '4 4' }}
                                isAnimationActive={false}
                                animationDuration={0}
                                animationEasing="linear"
                                position={{ y: 0 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="url(#strokeGradient)"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorValue)"
                                animationDuration={500}
                                activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                                isAnimationActive={false}
                            />
                            {shouldShowBrush && brushEndIndex > 0 && (
                                <Brush
                                    dataKey="timestamp"
                                    height={30}
                                    stroke="#8B5CF6"
                                    fill="#1f2937"
                                    tickFormatter={(unixTime: number) => {
                                        if (!unixTime || isNaN(unixTime)) return '';
                                        return format(new Date(unixTime * 1000), 'h:mm');
                                    }}
                                    startIndex={brushStartIndex}
                                    endIndex={brushEndIndex}
                                    onChange={(e: any) => {
                                        if (e.startIndex !== undefined && e.endIndex !== undefined) {
                                            setBrushStartIndex(e.startIndex);
                                            setBrushEndIndex(e.endIndex);
                                        }
                                    }}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
