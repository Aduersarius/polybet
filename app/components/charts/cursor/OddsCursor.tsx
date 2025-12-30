'use client';

import { formatCursorTimestamp } from '@/lib/chart/format';
import type { OddsPeriod } from '../axis/TimelineTick';

type CursorItem = {
  pointY: number;
  y: number;
  value: number;
  color: string;
  name: string;
};

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

/**
 * Cursor renderer: crosshair + shaded area + date label + per-series value labels.
 * Keeps labels close to points while preventing overlap.
 */
export function OddsCursor({
  points,
  payload,
  width,
  height,
  period,
  resolveSeriesMeta,
  viewBox,
  offset,
  yAxisMap,
  yDomain,
  padding = { top: 32, bottom: 32 },
}: any & {
  period: OddsPeriod;
  resolveSeriesMeta: (dataKey: string) => { name: string; color: string };
  yDomain?: [number, number];
  padding?: { top: number; bottom: number };
}) {
  if (!points || !payload || payload.length === 0) return null;

  const chartWidth = width || 800;
  const chartHeight = height || 300;

  const plotLeft =
    (typeof offset?.left === 'number' ? offset.left : undefined) ??
    (typeof viewBox?.x === 'number' ? viewBox.x : 0);
  const plotTop =
    (typeof offset?.top === 'number' ? offset.top : undefined) ??
    (typeof viewBox?.y === 'number' ? viewBox.y : 0);
  const plotWidth =
    (typeof offset?.width === 'number' ? offset.width : undefined) ??
    (typeof viewBox?.width === 'number' ? viewBox.width : chartWidth);
  const plotHeight =
    (typeof offset?.height === 'number' ? offset.height : undefined) ??
    (typeof viewBox?.height === 'number' ? viewBox.height : chartHeight);

  const plotRight = plotLeft + plotWidth;
  const plotBottom = plotTop + plotHeight;

  // X Position (Vertical Line)
  // Use snapped X from points
  const coordinate = points[0];
  const x = coordinate?.x ?? 0;

  // Y Calculation (Geometry based)
  const domainMin = yDomain?.[0] ?? 0;
  const domainMax = yDomain?.[1] ?? 100;
  const domainRange = domainMax - domainMin || 1;

  const innerHeight = Math.max(0, plotHeight - padding.top - padding.bottom);
  const chartAreaTop = plotTop + padding.top;

  const items: CursorItem[] = payload.map((p: any) => {
    const dataKey = p?.dataKey as string;
    const value = p?.value ?? 0;
    const meta = resolveSeriesMeta(dataKey);

    const normalized = (value - domainMin) / domainRange;
    const clampedNorm = Math.max(0, Math.min(1, normalized));

    // Recharts Y-axis inverted
    const y = chartAreaTop + innerHeight * (1 - clampedNorm);

    return {
      pointY: y, // Legacy compat
      y,
      value,
      color: meta.color,
      name: meta.name,
    };
  });

  // Sort by Value Descending
  items.sort((a, b) => b.value - a.value);

  // Layout Constraints
  const labelHeight = 24;
  const labelGap = 0;
  const minSep = labelHeight + labelGap;

  const minCenter = plotTop + labelHeight / 2;
  const maxCenter = plotBottom - labelHeight / 2 - 28; // Buffer

  const centers = items.map((it) => clamp(it.y, minCenter, maxCenter));

  // Constraint Propagation
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] < centers[i - 1] + minSep) centers[i] = centers[i - 1] + minSep;
  }
  if (centers.length > 0) {
    const last = centers.length - 1;
    if (centers[last] > maxCenter) centers[last] = maxCenter;
  }
  for (let i = centers.length - 2; i >= 0; i--) {
    if (centers[i] > centers[i + 1] - minSep) centers[i] = centers[i + 1] - minSep;
  }
  if (centers.length > 0 && centers[0] < minCenter) {
    centers[0] = minCenter;
  }
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] < centers[i - 1] + minSep) centers[i] = centers[i - 1] + minSep;
  }

  const laidOut = items.map((it, idx) => ({ ...it, renderY: centers[idx] - labelHeight / 2 }));

  // Render Props
  const timestamp = payload[0]?.payload?.timestamp ?? points?.[0]?.payload?.timestamp;
  const formattedDate = formatCursorTimestamp(timestamp, period);

  const dateLabelWidth = 150;
  const dateLabelX = clamp(x - dateLabelWidth / 2, plotLeft, plotRight - dateLabelWidth);

  const tooltipWidth = 200;
  const tooltipGap = 12;
  const showLeft = x > plotRight - 150;
  let tooltipX = showLeft ? x - tooltipWidth - tooltipGap : x + tooltipGap;
  tooltipX = clamp(tooltipX, plotLeft - 50, plotRight - tooltipWidth + 50);

  return (
    <g className="pointer-events-none">
      {/* Future Shading */}
      <rect
        x={x}
        y={plotTop}
        width={Math.max(0, plotRight - x)}
        height={plotHeight}
        fill="rgba(26, 29, 40, 0.5)"
        style={{ pointerEvents: 'none' }}
      />

      {/* Dashed Line */}
      <line
        x1={x}
        y1={plotTop}
        x2={x}
        y2={plotBottom}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Date Label - Top (Y=10) */}
      <foreignObject x={dateLabelX} y={10} width={dateLabelWidth} height={26}>
        <div className="flex justify-center">
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
                title={item.name}
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


