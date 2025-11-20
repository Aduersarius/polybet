'use client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface VolumeGraphProps {
    eventId: string;
}

export function VolumeGraph({ eventId }: VolumeGraphProps) {
    // Mock data for volume over time
    const data = [
        { time: '12/15', yes: 120000, no: 95000 },
        { time: '12/16', yes: 150000, no: 110000 },
        { time: '12/17', yes: 98000, no: 130000 },
        { time: '12/18', yes: 175000, no: 145000 },
        { time: '12/19', yes: 210000, no: 180000 },
        { time: '12/20', yes: 190000, no: 160000 },
        { time: '12/21', yes: 230000, no: 195000 },
    ];

    const formatCurrency = (value: number) => {
        return `$${(value / 1000).toFixed(0)}K`;
    };

    return (
        <div className="material-card p-5">
            <h3 className="text-lg font-medium mb-4">Trading Volume</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                        dataKey="time"
                        stroke="#999"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="#999"
                        style={{ fontSize: '12px' }}
                        tickFormatter={formatCurrency}
                        label={{ value: 'Volume (USD)', angle: -90, position: 'insideLeft', style: { fill: '#999' } }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            color: '#fff'
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar dataKey="yes" fill="#03dac6" name="Yes Volume" />
                    <Bar dataKey="no" fill="#cf6679" name="No Volume" />
                </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-[#2c2c2c] rounded p-3">
                    <div className="text-xs text-gray-500 mb-1">Total Volume</div>
                    <div className="text-xl font-bold text-[#bb86fc]">$1.8M</div>
                </div>
                <div className="bg-[#2c2c2c] rounded p-3">
                    <div className="text-xs text-gray-500 mb-1">Total Bets</div>
                    <div className="text-xl font-bold text-[#03dac6]">3,247</div>
                </div>
            </div>
        </div>
    );
}
