'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface OddsGraphProps {
    eventId: string;
}

export function OddsGraph({ eventId }: OddsGraphProps) {
    // Mock data for odds changes over time
    const data = [
        { time: '12/15', yes: 45, no: 55 },
        { time: '12/16', yes: 47, no: 53 },
        { time: '12/17', yes: 44, no: 56 },
        { time: '12/18', yes: 48, no: 52 },
        { time: '12/19', yes: 50, no: 50 },
        { time: '12/20', yes: 52, no: 48 },
        { time: '12/21', yes: 49, no: 51 },
    ];

    return (
        <div className="material-card p-5">
            <h3 className="text-lg font-medium mb-4">Odds History</h3>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                        dataKey="time"
                        stroke="#999"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="#999"
                        style={{ fontSize: '12px' }}
                        label={{ value: 'Probability (%)', angle: -90, position: 'insideLeft', style: { fill: '#999' } }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            color: '#fff'
                        }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="yes"
                        stroke="#03dac6"
                        strokeWidth={2}
                        dot={{ fill: '#03dac6', r: 4 }}
                        name="Yes"
                    />
                    <Line
                        type="monotone"
                        dataKey="no"
                        stroke="#cf6679"
                        strokeWidth={2}
                        dot={{ fill: '#cf6679', r: 4 }}
                        name="No"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
