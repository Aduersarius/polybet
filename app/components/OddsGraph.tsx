'use client';

import { useEffect, useRef, useState } from 'react';
import {
    createChart,
    ColorType,
    IChartApi,
    AreaSeries,
    Time,
} from 'lightweight-charts';

interface OddsGraphProps {
    eventId: string;
}

// Generate mock odds data based on selected period
const generateData = (period: string): { time: Time; value: number }[] => {
    const now = Math.floor(Date.now() / 1000);
    let points = 100;
    let interval = 3600; // 1 hour default
    if (period === '1h') {
        points = 24;
        interval = 3600;
    } else if (period === '24h') {
        points = 24;
        interval = 3600;
    } else if (period === '7d') {
        points = 7 * 24;
        interval = 3600;
    } else if (period === '30d') {
        points = 30 * 24;
        interval = 3600;
    }
    const data: { time: Time; value: number }[] = [];
    let price = 50;
    for (let i = 0; i < points; i++) {
        const time = (now - (points - i) * interval) as Time;
        price = price + (Math.random() - 0.5) * 5;
        if (price > 99) price = 99;
        if (price < 1) price = 1;
        data.push({ time, value: price });
    }
    return data;
};

export function OddsGraph({ eventId }: OddsGraphProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<any>(null);
    const [period, setPeriod] = useState<string>('1h');

    // Initialize chart once
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#d1d5db',
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 300,
            timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                autoScale: false,
                // min/max are set via applyOptions later
            },
        });

        // Enforce 0‑100 range on the right price scale via applyOptions
        // This line is now redundant

        const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: '#bb86fc',
            topColor: 'rgba(187, 134, 252, 0.4)',
            bottomColor: 'rgba(187, 134, 252, 0.0)',
            lineWidth: 2,
        });
        seriesRef.current = areaSeries;
        areaSeries.setData(generateData(period));
        chart.timeScale().fitContent();
        chartRef.current = chart;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [eventId]);

    // Update data when period changes
    useEffect(() => {
        if (!seriesRef.current) return;
        seriesRef.current.setData(generateData(period));
        if (chartRef.current) chartRef.current.timeScale().fitContent();
    }, [period]);

    return (
        <div className="relative w-full h-full">
            {/* PolyBet watermark */}
            <div className="absolute top-2 left-2 flex items-center pointer-events-none" style={{ opacity: 0.1 }}>
                <img src="/logo-option5-advanced-10cuts.svg" alt="PolyBet logo" className="w-12 h-12" />
                <span className="text-lg font-bold text-white ml-1">PolyBet</span>
            </div>
            {/* Period selector */}
            <div className="absolute top-2 right-2 z-10">
                <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="bg-black/30 text-white rounded px-2 py-1 text-sm"
                >
                    <option value="1h">1h</option>
                    <option value="24h">24h</option>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                </select>
            </div>
            <div ref={chartContainerRef} className="w-full h-full" />
        </div>
    );
}
