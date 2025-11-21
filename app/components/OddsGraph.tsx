'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, AreaSeries, Time } from 'lightweight-charts';

interface OddsGraphProps {
    eventId: string;
}

export function OddsGraph({ eventId }: OddsGraphProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#d1d5db',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 300,
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
        });

        const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: '#bb86fc',
            topColor: 'rgba(187, 134, 252, 0.4)',
            bottomColor: 'rgba(187, 134, 252, 0.0)',
            lineWidth: 2,
        });

        // Generate mock data for the chart
        // In a real app, this would fetch historical odds from the API
        const data = [];
        let price = 50;
        const now = Math.floor(Date.now() / 1000);

        for (let i = 0; i < 100; i++) {
            const time = (now - (100 - i) * 3600) as Time; // Hourly data points
            price = price + (Math.random() - 0.5) * 5;
            if (price > 99) price = 99;
            if (price < 1) price = 1;

            data.push({ time, value: price });
        }

        areaSeries.setData(data);
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

    return <div ref={chartContainerRef} className="w-full h-full" />;
}
