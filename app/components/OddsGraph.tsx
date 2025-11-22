'use client';

import { useEffect, useRef, useState } from 'react';

interface OddsGraphProps {
    eventId: string;
}

interface DataPoint {
    timestamp: number;
    yesPrice: number;
    volume: number;
}

export function OddsGraph({ eventId }: OddsGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [period, setPeriod] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DataPoint[]>([]);
    const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; value: number; timestamp: number } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/events/${eventId}/odds-history?period=${period}`);
                const result = await response.json();
                setData(result.data || []);
            } catch (error) {
                console.error('Failed to fetch odds history:', error);
                setData([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [eventId, period]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || data.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 60, bottom: 50, left: 20 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw subtle grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;

        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }

        // Find data range
        const minPrice = Math.min(...data.map(d => d.yesPrice));
        const maxPrice = Math.max(...data.map(d => d.yesPrice));

        // Calculate nice range for Y-axis
        const yMin = Math.max(0, Math.floor(minPrice * 100) - 2);
        const yMax = Math.min(100, Math.ceil(maxPrice * 100) + 2);
        const yRange = yMax - yMin;

        // Draw Y-axis labels (percentage format)
        ctx.fillStyle = '#6B7280';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'right';

        for (let i = 0; i <= 5; i++) {
            const percent = yMax - (yRange / 5) * i;
            const y = padding.top + (chartHeight / 5) * i;
            ctx.fillText(`${Math.round(percent)}%`, width - 5, y + 4);
        }

        // Draw X-axis month labels (like Polymarket)
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6B7280';

        const labelCount = Math.min(6, data.length);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i < labelCount; i++) {
            const dataIndex = Math.floor((data.length - 1) * (i / (labelCount - 1)));
            const point = data[dataIndex];
            const x = padding.left + (chartWidth * (i / (labelCount - 1)));
            const date = new Date(point.timestamp * 1000);
            const label = months[date.getMonth()];
            ctx.fillText(label, x, height - 20);
        }

        // Draw area fill first
        ctx.beginPath();
        data.forEach((point, index) => {
            const x = padding.left + (index / (data.length - 1)) * chartWidth;
            const normalizedPrice = ((point.yesPrice * 100) - yMin) / yRange;
            const y = padding.top + chartHeight - (normalizedPrice * chartHeight);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw line
        ctx.strokeStyle = '#8B5CF6';
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        data.forEach((point, index) => {
            const x = padding.left + (index / (data.length - 1)) * chartWidth;
            const normalizedPrice = ((point.yesPrice * 100) - yMin) / yRange;
            const y = padding.top + chartHeight - (normalizedPrice * chartHeight);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw crosshair and hover indicator
        if (hoveredPoint) {
            // Vertical crosshair line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(hoveredPoint.x, padding.top);
            ctx.lineTo(hoveredPoint.x, height - padding.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Dot on line
            ctx.fillStyle = '#8B5CF6';
            ctx.beginPath();
            ctx.arc(hoveredPoint.x, hoveredPoint.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#1F2937';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Tooltip with date and percentage
            const date = new Date(hoveredPoint.timestamp * 1000);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const percentStr = `Yes ${(hoveredPoint.value * 100).toFixed(1)}% `;

            const tooltipLines = [percentStr, `${dateStr} ${timeStr} `];
            const lineHeight = 18;
            const tooltipPadding = 8;
            const tooltipWidth = 140;
            const tooltipHeight = tooltipLines.length * lineHeight + tooltipPadding * 2;

            // Position tooltip
            let tooltipX = hoveredPoint.x + 10;
            let tooltipY = hoveredPoint.y - tooltipHeight / 2;

            // Keep tooltip in bounds
            if (tooltipX + tooltipWidth > width - padding.right) {
                tooltipX = hoveredPoint.x - tooltipWidth - 10;
            }
            if (tooltipY < padding.top) tooltipY = padding.top;
            if (tooltipY + tooltipHeight > height - padding.bottom) {
                tooltipY = height - padding.bottom - tooltipHeight;
            }

            // Draw tooltip background
            ctx.fillStyle = '#1F2937';
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1;

            const radius = 6;
            ctx.beginPath();
            ctx.moveTo(tooltipX + radius, tooltipY);
            ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
            ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
            ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
            ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
            ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
            ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
            ctx.lineTo(tooltipX, tooltipY + radius);
            ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw tooltip text
            ctx.font = 'bold 12px system-ui';
            ctx.fillStyle = '#A78BFA';
            ctx.textAlign = 'left';
            ctx.fillText(tooltipLines[0], tooltipX + tooltipPadding, tooltipY + tooltipPadding + 12);

            ctx.font = '11px system-ui';
            ctx.fillStyle = '#9CA3AF';
            ctx.fillText(tooltipLines[1], tooltipX + tooltipPadding, tooltipY + tooltipPadding + 12 + lineHeight);
        }

        // Draw watermark
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.font = 'bold 48px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('PolyBet', padding.left + 20, padding.top + 80);

    }, [data, hoveredPoint]);

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || data.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const padding = { top: 20, right: 60, bottom: 50, left: 20 };
        const chartWidth = rect.width - padding.left - padding.right;
        const chartHeight = rect.height - padding.top - padding.bottom;

        const relativeX = x - padding.left;
        const dataIndex = Math.max(0, Math.min(data.length - 1, Math.round((relativeX / chartWidth) * (data.length - 1))));

        if (dataIndex >= 0 && dataIndex < data.length) {
            const point = data[dataIndex];
            const minPrice = Math.min(...data.map(d => d.yesPrice));
            const maxPrice = Math.max(...data.map(d => d.yesPrice));

            const yMin = Math.max(0, Math.floor(minPrice * 100) - 2);
            const yMax = Math.min(100, Math.ceil(maxPrice * 100) + 2);
            const yRange = yMax - yMin;

            const normalizedPrice = ((point.yesPrice * 100) - yMin) / yRange;
            const pointX = padding.left + (dataIndex / (data.length - 1)) * chartWidth;
            const pointY = padding.top + chartHeight - (normalizedPrice * chartHeight);

            setHoveredPoint({ x: pointX, y: pointY, value: point.yesPrice, timestamp: point.timestamp });
        }
    };

    const handleMouseLeave = () => {
        setHoveredPoint(null);
    };

    const currentPrice = data.length > 0 ? data[data.length - 1].yesPrice : 0;

    return (
        <div className="material-card p-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="text-3xl font-bold text-purple-400 mb-1">
                        {(currentPrice * 100).toFixed(1)}% chance
                    </div>
                    <h3 className="text-sm text-gray-400">Odds History</h3>
                </div>
            </div>

            <div className="relative w-full h-[300px] mb-4">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                    </div>
                )}

                <canvas
                    ref={canvasRef}
                    className="w-full h-full cursor-crosshair"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                />
            </div>

            {/* Time period buttons */}
            <div className="flex gap-2 justify-start">
                {['1h', '6h', '1d', '1w', '1m', 'all'].map((p) => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px - 3 py - 1.5 text - xs font - medium rounded transition - colors ${period === p
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            } `}
                    >
                        {p.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>
    );
}
