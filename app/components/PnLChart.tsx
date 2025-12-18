'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colors } from '@/lib/colors';

interface PnLChartProps {
    data?: { date: string; value: number }[];
    color?: string;
    className?: string;
    title?: string;
}

// Mock data if none provided
const mockData = Array.from({ length: 30 }, (_, i) => {
    const value = 1000 + Math.random() * 500 - 250 + (i * 50); // Upward trend
    return {
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
        value
    };
});

export default function PnLChart({ data = mockData, color = colors.success, className, title = "PROFIT/LOSS (30D)" }: PnLChartProps) {
    const isPositive = (data[data.length - 1]?.value || 0) >= (data[0]?.value || 0);
    const chartColor = isPositive ? colors.success : colors.error;
    const startValue = data[0]?.value || 0;
    const endValue = data[data.length - 1]?.value || 0;
    const diff = endValue - startValue;
    const percentChange = startValue !== 0 ? (diff / startValue) * 100 : 0;

    return (
        <div className={`flex flex-col h-full bg-zinc-800 rounded-xl border border-transparent p-4 shadow-lg ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-400 uppercase tracking-wider">{title}</span>
                <span className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)} ({diff >= 0 ? '+' : ''}{percentChange.toFixed(1)}%)
                </span>
            </div>
            <div className="flex-1 w-full min-h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="bg-zinc-800 border border-white/10 shadow-xl rounded-lg p-3 min-w-[120px]">
                                            <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">
                                                {data.date || 'Estimate'}
                                            </div>
                                            <div className={`text-sm font-bold font-mono ${payload[0].value! >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {payload[0].value! >= 0 ? '+' : ''}${Number(payload[0].value).toFixed(2)}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                            cursor={{ stroke: colors.text.primary, strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.5 }}
                            animationDuration={0}
                            isAnimationActive={false}
                        />
                        <XAxis dataKey="date" hide />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={chartColor}
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorValue)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
