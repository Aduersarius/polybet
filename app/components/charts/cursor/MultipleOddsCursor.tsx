import React from 'react';
import { format } from 'date-fns';
import { formatCursorTimestamp } from '@/lib/chart/format';
import type { OddsPeriod } from '@/app/components/charts/axis/TimelineTick';

interface MultipleOddsCursorProps {
    payload?: any[];
    points?: any[];
    width?: number;
    height?: number;
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
    yDomain?: [number, number];
    padding?: { top: number; bottom: number };
    period?: OddsPeriod;
    resolveSeriesMeta?: (dataKey: string) => { name: string; color: string };
    coordinate?: { x: number; y: number };
}



const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export function MultipleOddsCursor({
    payload,
    width,
    height,
    top,
    left,
    yDomain,
    padding = { top: 32, bottom: 32 }, // Default matches OddsChartV2
    period,
    resolveSeriesMeta,
    coordinate,
    points,
}: MultipleOddsCursorProps) {
    if (!payload || !payload.length || !resolveSeriesMeta) return null;

    const plotHeight = height ?? 0;
    const plotTop = top ?? 0;
    const plotLeft = left ?? 0;
    const plotWidth = width ?? 0;
    const plotRight = plotLeft + plotWidth;
    const plotBottom = plotTop + plotHeight;

    // X Position (Vertical Line)
    const x = (points && points[0]?.x) ?? coordinate?.x ?? 0;

    // Process Tooltip Items
    // 1. Map to basic data
    // 2. Calculate Strict Y Position based on Geometry + Padding
    const domainMin = yDomain?.[0] ?? 0;
    const domainMax = yDomain?.[1] ?? 100;
    const domainRange = domainMax - domainMin || 1;

    const innerHeight = Math.max(0, plotHeight - padding.top - padding.bottom);
    const chartAreaTop = plotTop + padding.top;

    const items = payload.map((p) => {
        const dataKey = p?.dataKey as string;
        const value = p?.value ?? 0;
        const meta = resolveSeriesMeta(dataKey);

        // Calculate normalized position (0..1)
        const normalized = (value - domainMin) / domainRange;
        const clampedNorm = Math.max(0, Math.min(1, normalized));

        // Calculate Y Pixel: Top + PaddingTop + (InnerHeight * (1 - normalized))
        // 100% -> chartAreaTop
        // 0% -> chartAreaTop + innerHeight
        // Recharts Y-axis is inverted (0 at bottom)
        const y = chartAreaTop + innerHeight * (1 - clampedNorm);

        return {
            value,
            y,
            color: meta.color,
            name: meta.name,
        };
    });

    // Sort by Value Descending (Highest % at Top)
    items.sort((a, b) => b.value - a.value);

    // Layout & Collision Avoidance
    // Determine centers for labels
    const labelHeight = 24;
    const labelGap = 0;
    const minSep = labelHeight + labelGap;

    // Bounds for labels center
    const minCenter = plotTop + labelHeight / 2;
    // Add 28px buffer at bottom to avoid overlapping x-axis labels
    const maxCenter = plotBottom - labelHeight / 2 - 28;

    const centers = items.map((it) => clamp(it.y, minCenter, maxCenter));

    // 1. Forward Pass (Push Down)
    for (let i = 1; i < centers.length; i++) {
        if (centers[i] < centers[i - 1] + minSep) {
            centers[i] = centers[i - 1] + minSep;
        }
    }

    // 2. Constrain Bottom
    const last = centers.length - 1;
    if (centers.length > 0 && centers[last] > maxCenter) {
        centers[last] = maxCenter;
    }

    // 3. Backward Pass (Push Up from constrained bottom)
    for (let i = centers.length - 2; i >= 0; i--) {
        if (centers[i] > centers[i + 1] - minSep) {
            centers[i] = centers[i + 1] - minSep;
        }
    }

    // 4. Constrain Top
    if (centers.length > 0 && centers[0] < minCenter) {
        centers[0] = minCenter;
    }

    // 5. Final Forward Pass
    for (let i = 1; i < centers.length; i++) {
        if (centers[i] < centers[i - 1] + minSep) {
            centers[i] = centers[i - 1] + minSep;
        }
    }

    const laidOut = items.map((it, idx) => ({ ...it, renderY: centers[idx] - labelHeight / 2 }));

    // Render
    const timestamp = payload[0]?.payload?.timestamp ?? points?.[0]?.payload?.timestamp;
    const formattedDate = formatCursorTimestamp(timestamp, period ?? 'all');
    const dateLabelWidth = 150;

    // Tooltip Box Position
    const tooltipWidth = 200; // Constrained max width, but content is dynamic inside
    const tooltipGap = 12;
    const showLeft = x > plotRight - 250;

    let tooltipX = showLeft ? x - tooltipWidth - tooltipGap : x + tooltipGap;
    tooltipX = clamp(tooltipX, plotLeft - 50, plotRight - tooltipWidth + 50);

    // Date label position - stays close to the cursor line
    const dateLabelGap = 8;
    let dateLabelX = showLeft ? x - dateLabelWidth - dateLabelGap : x + dateLabelGap;
    dateLabelX = clamp(dateLabelX, plotLeft, plotRight - dateLabelWidth);

    return (
        <g className="pointer-events-none">
            {/* Future Shading overlay */}
            <rect
                x={x}
                y={plotTop}
                width={Math.max(0, plotRight - x)}
                height={plotHeight}
                fill="rgba(26, 29, 40, 0.5)"
                style={{ pointerEvents: 'none' }}
            />

            {/* Dashed Line */}
            <line x1={x} y1={plotTop} x2={x} y2={plotBottom} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="4 4" />

            {/* Date Label - Same side as tooltips, close to cursor line */}
            <foreignObject x={dateLabelX} y={plotTop + 8} width={dateLabelWidth} height={26}>
                <div className={`flex ${showLeft ? 'justify-end' : 'justify-start'}`}>
                    <div className="text-[12px] font-medium text-[#94a3b8] whitespace-nowrap">
                        {formattedDate}
                    </div>
                </div>
            </foreignObject>

            {/* Items */}
            {laidOut.map((item, idx) => (
                <foreignObject key={idx} x={tooltipX} y={item.renderY} width={tooltipWidth} height={labelHeight}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: showLeft ? 'flex-end' : 'flex-start',
                            width: '100%',
                            height: '100%',
                        }}
                    >
                        <div
                            style={{
                                background: 'rgba(26, 29, 40, 0.95)',
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
                                maxWidth: '100%',
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
                            <span
                                style={{
                                    color: '#E5E7EB',
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '120px',
                                }}
                            >
                                {item.name}
                            </span>
                            <span style={{ color: item.color, fontWeight: 700 }}>
                                {parseFloat(item.value.toFixed(2))}%
                            </span>
                        </div>
                    </div>
                </foreignObject>
            ))}
        </g>
    );
}
