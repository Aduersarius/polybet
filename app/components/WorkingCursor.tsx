'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface WorkingCursorProps {
    points?: Array<{ x: number; y: number }>;
    width?: number;
    height?: number;
    stroke?: string;
    strokeWidth?: number;
    period?: string;
}

export function WorkingCursor({
    points = [],
    width = 0,
    height = 0,
    stroke = 'rgba(255, 0, 0, 1)',
    strokeWidth = 3,
    period = 'all',
}: WorkingCursorProps) {
    const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
    const [timestamp, setTimestamp] = useState<number | null>(null);

    // Find the cursor position from points (usually the first point is the cursor)
    useEffect(() => {
        if (points && points.length > 0) {
            const cursorPoint = points[0];
            setCursorPosition({ x: cursorPoint.x, y: cursorPoint.y });

            // Extract timestamp from the data - this would come from the chart data
            // For now, we'll use the current time as a placeholder
            setTimestamp(Date.now());
        }
    }, [points]);

    // Format timestamp based on the current period
    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);

        if (period === '1h' || period === '6h') {
            return format(date, 'h:mm a');
        } else if (period === '1d') {
            return format(date, 'ha');
        } else if (period === '1w') {
            return format(date, 'MMM d, h a');
        } else if (period === '1m') {
            return format(date, 'MMM d');
        } else {
            // Default format for 'all' or unknown periods
            return format(date, 'MMM d, yyyy h:mm a');
        }
    };

    if (!cursorPosition || timestamp === null) {
        return null;
    }

    return (
        <g>
            {/* Vertical cursor line */}
            <line
                x1={cursorPosition.x}
                y1={0}
                x2={cursorPosition.x}
                y2={height}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray="0"
                pointerEvents="none"
            />

            {/* Datetime display above the cursor */}
            {cursorPosition.y > 20 && ( // Only show if there's space above
                <foreignObject
                    x={cursorPosition.x - 50} // Center the text
                    y={10} // Position above the cursor
                    width="100"
                    height="20"
                    pointerEvents="none"
                >
                    <div style={{
                        backgroundColor: 'rgba(30, 30, 30, 0.9)',
                        color: '#ffffff',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        border: '1px solid rgba(187, 134, 252, 0.5)',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }}>
                        {formatTimestamp(timestamp)}
                    </div>
                </foreignObject>
            )}
        </g>
    );
}