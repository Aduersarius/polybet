'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';


interface OddsGraphProps {
    eventId: string;
}

interface DataPoint {
    timestamp: number; // Unix seconds
    yesPrice: number; // probability 0-1
    volume: number;
}

export function OddsGraph({ eventId }: OddsGraphProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const lineSeriesRef = useRef<any>(null);
    const tintedSeriesRef = useRef<any>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const dataRef = useRef<DataPoint[]>([]);
    const [period, setPeriod] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DataPoint[]>([]);
    const [currentPrice, setCurrentPrice] = useState(0);

    // Fetch historical data when period or event changes
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/events/${eventId}/odds-history?period=${period}`);
                const json = await res.json();
                setData(json.data || []);
                // Set initial current price from latest data
                if (json.data && json.data.length > 0) {
                    setCurrentPrice(json.data[json.data.length - 1].yesPrice);
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

    // Initialize chart once
    useEffect(() => {
        if (!chartContainerRef.current) return;
        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 300,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#6B7280',
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.03)' },
                horzLines: { color: 'rgba(255,255,255,0.03)' },
            },
            timeScale: {
                borderColor: 'rgba(255,255,255,0.1)',
                timeVisible: true,
                secondsVisible: false,
            },
            rightPriceScale: {
                borderColor: 'rgba(255,255,255,0.1)',
                visible: true,
                autoScale: true,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            crosshair: {
                mode: 0, // Normal crosshair
                vertLine: {
                    width: 1,
                    color: 'rgba(139, 92, 246, 0.5)',
                    style: 0,
                    labelBackgroundColor: '#8B5CF6',
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(139, 92, 246, 0.5)',
                    style: 0,
                    labelVisible: false,
                    visible: false,
                },
            },
            localization: {
                priceFormatter: (price: number) => `${Math.round(price)}%`,
            },
        });
        const lineSeries = chart.addSeries(LineSeries, {
            color: '#8B5CF6',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => `${price.toFixed(1)}%`,
            },
        });
        const tintedSeries = chart.addSeries(LineSeries, {
            color: '#6B7280', // Dark gray for tint
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => `${price.toFixed(1)}%`,
            },
        });
        chartRef.current = chart;
        lineSeriesRef.current = lineSeries;
        tintedSeriesRef.current = tintedSeries;

        // Custom mouse move handler for tooltip that follows the line
        const handleMouseMove = (event: MouseEvent) => {
            if (!tooltipRef.current || !chartRef.current || !chartContainerRef.current) return;

            const container = chartContainerRef.current;
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Convert mouse X to time
            const time = chartRef.current.timeScale().coordinateToTime(x);
            const currentData = dataRef.current;
            if (!time || currentData.length === 0) {
                tooltipRef.current.style.display = 'none';
                if (currentData.length > 0) {
                    setCurrentPrice(currentData[currentData.length - 1].yesPrice);
                }
                return;
            }

            // Find closest data point
            let closestIndex = 0;
            let minDiff = Math.abs(currentData[0].timestamp - time);
            for (let i = 1; i < currentData.length; i++) {
                const diff = Math.abs(currentData[i].timestamp - time);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }

            const closestPoint = currentData[closestIndex];
            const value = closestPoint.yesPrice * 100;

            // Update current price
            requestAnimationFrame(() => {
                setCurrentPrice(closestPoint.yesPrice);
            });

            // Split the line: main series up to this point, tinted series from this point onwards
            const mainData = currentData.slice(0, closestIndex + 1).map(p => ({
                time: p.timestamp as any,
                value: Number((p.yesPrice * 100).toFixed(2)),
            }));
            const tintedData = currentData.slice(closestIndex).map(p => ({
                time: p.timestamp as any,
                value: Number((p.yesPrice * 100).toFixed(2)),
            }));
            if (lineSeriesRef.current) {
                lineSeriesRef.current.setData(mainData);
            }
            if (tintedSeriesRef.current) {
                tintedSeriesRef.current.setData(tintedData);
            }

            // Get coordinates for the closest point
            const xCoord = chartRef.current.timeScale().timeToCoordinate(closestPoint.timestamp);
            const yCoord = lineSeriesRef.current.priceToCoordinate(value);

            if (xCoord !== null && yCoord !== null) {
                const tooltip = tooltipRef.current;
                const containerWidth = container.clientWidth;
                const tooltipWidth = 80;

                const left = Math.min(xCoord + 10, containerWidth - tooltipWidth);
                const top = Math.max(yCoord - 20, 10);

                tooltip.style.display = 'block';
                tooltip.style.transform = `translate(${left}px, ${top}px)`;
                tooltip.textContent = `${value.toFixed(1)}%`;
            }
        };

        const handleMouseLeave = () => {
            if (tooltipRef.current) {
                tooltipRef.current.style.display = 'none';
                const currentData = dataRef.current;
                if (currentData.length > 0) {
                    setCurrentPrice(currentData[currentData.length - 1].yesPrice);
                }
            }
            // Reset both series to full data
            const currentData = dataRef.current;
            const formatted = currentData.map(p => ({
                time: p.timestamp as any,
                value: Number((p.yesPrice * 100).toFixed(2)),
            }));
            if (lineSeriesRef.current) {
                lineSeriesRef.current.setData(formatted);
            }
            if (tintedSeriesRef.current) {
                tintedSeriesRef.current.setData([]);
            }
        };

        // Add mouse event listeners to chart container
        const container = chartContainerRef.current;
        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            if (container) {
                container.removeEventListener('mousemove', handleMouseMove);
                container.removeEventListener('mouseleave', handleMouseLeave);
            }
            chart.remove();
        };
    }, []);

    // Update chart data when historical data changes
    useEffect(() => {
        dataRef.current = data;
        if (!lineSeriesRef.current || !tintedSeriesRef.current) return;
        const formatted = data.map(p => ({
            time: p.timestamp as any,
            value: Number((p.yesPrice * 100).toFixed(2)),
        }));
        lineSeriesRef.current.setData(formatted);
        tintedSeriesRef.current.setData([]); // Initially no tinted part
        // Auto-fit content after data update
        if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
        }
    }, [data]);

    // Real‑time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');
        const handler = (update: any) => {
            if (update.eventId !== eventId) return;
            const newPoint: DataPoint = {
                timestamp: update.timestamp,
                yesPrice: update.yesPrice,
                volume: update.volume,
            };
            setData(prev => [...prev, newPoint]);
            if (lineSeriesRef.current) {
                lineSeriesRef.current.update({
                    time: newPoint.timestamp as any,
                    value: Number((newPoint.yesPrice * 100).toFixed(2)),
                });
            }
        };
        socket.on(`odds-update-${eventId}`, handler);
        return () => {
            socket.off(`odds-update-${eventId}`, handler);
        };
    }, [eventId]);

    // Resize chart on container width change
    useEffect(() => {
        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);



    return (
        <div className="material-card p-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="text-3xl font-bold text-purple-400 mb-1 transition-all duration-200">
                        {(currentPrice * 100).toFixed(1)}% chance
                    </div>
                </div>
            </div>
            <div className="relative w-full h-[300px] mb-4">
                <div ref={chartContainerRef} className="w-full h-full [&_a[href*='tradingview']]:!hidden" />
                {/* Optimized tooltip with direct DOM manipulation */}
                <div
                    ref={tooltipRef}
                    className="absolute top-0 left-0 bg-gray-800/95 backdrop-blur-sm px-3 py-2 rounded-lg border border-purple-500/30 pointer-events-none z-10 text-sm font-medium text-purple-400"
                    style={{ display: 'none' }}
                />
                {/* Custom watermark */}
                <div className="absolute bottom-6 left-3 text-base text-gray-500 font-bold pointer-events-none z-5">
                    PolyBet
                </div>
            </div>
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm rounded-lg z-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
            )}
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
                <button
                    onClick={() => {
                        if (chartRef.current) {
                            chartRef.current.timeScale().fitContent();
                        }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-white/5 flex items-center gap-1"
                    title="Fit chart to content"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
                    </svg>
                    FIT
                </button>
            </div>
        </div>
    );
}