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
}: any & {
  period: OddsPeriod;
  resolveSeriesMeta: (dataKey: string) => { name: string; color: string };
  yDomain?: [number, number];
}) {
  if (!points || points.length === 0 || !payload || payload.length === 0) return null;

  const x = points[0].x;
  const timestamp = payload[0]?.payload?.timestamp;
  if (!timestamp) return null;

  const chartWidth = width || 800;
  const chartHeight = height || 300;
  const tooltipWidth = 160;
  const tooltipGap = 8;

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
  const domainMin = Array.isArray(yDomain) ? yDomain[0] : undefined;
  const domainMax = Array.isArray(yDomain) ? yDomain[1] : undefined;
  const domainRange =
    typeof domainMin === 'number' && typeof domainMax === 'number' ? domainMax - domainMin : undefined;

  // Edge-aware placement: prefer the right side, but flip when approaching the right border.
  // Use a small safety pad because tooltip content is `nowrap` and borders/padding can visually overflow.
  const tooltipOffsetRight = 12;
  const edgePad = 8;
  const wouldOverflowRight = x + tooltipOffsetRight + tooltipWidth + edgePad > plotRight;
  const wouldOverflowLeft = x - tooltipGap - tooltipWidth - edgePad < plotLeft;
  const canFitLeft = x - tooltipGap - tooltipWidth >= plotLeft;
  const canFitRight = x + tooltipOffsetRight + tooltipWidth <= plotRight;
  const tooltipSide: 'left' | 'right' =
    wouldOverflowRight && canFitLeft ? 'left' :
    wouldOverflowLeft && canFitRight ? 'right' :
    canFitRight ? 'right' :
    canFitLeft ? 'left' :
    'right';

  const dateLabelWidth = 150;
  const dateLabelX = clamp(
    tooltipSide === 'left' ? x - dateLabelWidth : x - dateLabelWidth / 2,
    plotLeft,
    plotRight - dateLabelWidth,
  );

  let tooltipX =
    tooltipSide === 'left' ? x - tooltipWidth - tooltipGap : x + tooltipOffsetRight;
  tooltipX = clamp(tooltipX, plotLeft, plotRight - tooltipWidth);

  // Map `points` to dataKey -> y to get exact rendered y when possible
  const pointYByKey = new Map<string, number>();
  if (Array.isArray(points)) {
    points.forEach((p: any) => {
      const key =
        (typeof p?.payload?.dataKey === 'string' ? p.payload.dataKey : undefined) ??
        (typeof p?.dataKey === 'string' ? p.dataKey : undefined) ??
        (typeof p?.key === 'string' ? p.key : undefined);
      if (typeof key === 'string' && typeof p?.y === 'number') {
        pointYByKey.set(key, p.y);
      }
    });
  }

  // If present, use the y-axis scale Recharts uses to render the chart.
  const scaleFn: ((v: any) => any) | undefined = (() => {
    if (!yAxisMap || typeof yAxisMap !== 'object') return undefined;
    const axis: any = Object.values(yAxisMap)[0];
    return typeof axis?.scale === 'function' ? axis.scale : undefined;
  })();

  // Some Recharts builds put the *same* `coordinate.y` on every payload item (cursor y, not series y).
  // If so, we must ignore it to avoid mismatched labels.
  const coordYs = payload
    .map((p: any) => p?.coordinate?.y)
    .filter((y: any) => typeof y === 'number') as number[];
  const coordYIsPerSeries = (() => {
    if (coordYs.length <= 1) return true;
    const min = Math.min(...coordYs);
    const max = Math.max(...coordYs);
    return max - min > 0.5; // treat tiny variance as identical
  })();

  const items: CursorItem[] = payload.map((p: any) => {
    const dataKey = p?.dataKey as string;
    const value = p?.value ?? 0;
    const meta = resolveSeriesMeta(dataKey);

    // Best-effort exact y:
    // 1) Recharts tooltip payload coordinate (often exact per-series)
    // 2) Recharts y-axis scale(value) (exact scale used to render)
    // 3) points map by dataKey (active dots)
    // 4) center of plot
    const yFromCoord =
      coordYIsPerSeries && typeof p?.coordinate?.y === 'number' ? p.coordinate.y : undefined;

    const scaled = scaleFn ? scaleFn(value) : undefined;
    const yFromScale =
      typeof scaled === 'number' && Number.isFinite(scaled)
        ? // Some scales return values relative to the plot box (0..plotHeight). If so, add plotTop.
          (scaled >= 0 && scaled <= plotHeight + 1 ? plotTop + scaled : scaled)
        : undefined;

    const yFromPoints =
      pointYByKey.get(dataKey) ??
      (dataKey?.startsWith('outcome_') ? pointYByKey.get(dataKey.replace('outcome_', '')) : undefined);

    let yFromDomain: number | undefined;
    if (
      typeof domainMin === 'number' &&
      typeof domainRange === 'number' &&
      domainRange !== 0
    ) {
      const normalized = (value - domainMin) / domainRange;
      const clamped = Math.max(0, Math.min(1, normalized));
      yFromDomain = plotTop + (plotHeight - clamped * plotHeight);
    }
    const y =
      (typeof yFromCoord === 'number' ? yFromCoord : undefined) ??
      (typeof yFromScale === 'number' && Number.isFinite(yFromScale) ? yFromScale : undefined) ??
      yFromPoints ??
      yFromDomain ??
      (plotTop + plotHeight / 2);

    return {
      pointY: clamp(y, plotTop, plotBottom),
      y: clamp(y, plotTop, plotBottom),
      value,
      color: meta.color,
      name: meta.name,
    };
  });

  // Layout: minimal gap, minimal displacement collision avoidance
  const boundsPad = 2;
  let labelHeight = 24;
  let labelGap = 0;

  const minTop = plotTop + boundsPad;
  const maxTop = plotBottom - boundsPad - labelHeight;

  const minCenter = minTop + labelHeight / 2;
  const maxCenter = maxTop + labelHeight / 2;

  const centers = items
    .slice()
    .sort((a, b) => a.pointY - b.pointY)
    .map((it) => clamp(it.pointY, minCenter, maxCenter));

  const minSep = labelHeight + labelGap;
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] < centers[i - 1] + minSep) centers[i] = centers[i - 1] + minSep;
  }
  const overflow = centers.length ? centers[centers.length - 1] - maxCenter : 0;
  if (overflow > 0) for (let i = 0; i < centers.length; i++) centers[i] -= overflow;
  for (let i = centers.length - 2; i >= 0; i--) {
    if (centers[i] > centers[i + 1] - minSep) centers[i] = centers[i + 1] - minSep;
  }
  const underflow = centers.length ? minCenter - centers[0] : 0;
  if (underflow > 0) for (let i = 0; i < centers.length; i++) centers[i] += underflow;

  const laidOut = items
    .slice()
    .sort((a, b) => a.pointY - b.pointY)
    .map((it, idx) => ({ ...it, y: centers[idx] - labelHeight / 2 }));

  const formattedDate = formatCursorTimestamp(timestamp, period);

  return (
    <g>
      <rect
        x={x}
        y={plotTop}
        width={Math.max(0, plotRight - x)}
        height={plotHeight}
        fill="rgba(26, 29, 40, 0.5)"
        style={{ pointerEvents: 'none' }}
      />

      <line
        x1={x}
        y1={plotTop}
        x2={x}
        y2={plotBottom}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      <foreignObject x={dateLabelX} y={50} width={150} height={26}>
        <div className="flex justify-center">
          <div className="bg-[#1a1d28]/90 border border-white/20 rounded px-2 py-0.5 text-[11px] font-medium text-gray-300 backdrop-blur-sm shadow-xl whitespace-nowrap">
            {formattedDate}
          </div>
        </div>
      </foreignObject>

      {laidOut.map((item, idx) => (
        <foreignObject key={idx} x={tooltipX} y={item.y} width={tooltipWidth} height={labelHeight}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: tooltipSide === 'left' ? 'flex-end' : 'flex-start',
              gap: '4px',
              width: '100%',
              height: '100%',
            }}
          >
            <div
              style={{
                background: 'rgba(26, 29, 40, 0.95)',
                border: `1px solid ${item.color}50`,
                borderRadius: '4px',
                padding: labelHeight <= 18 ? '1px 6px' : '2px 6px',
                fontSize: labelHeight <= 18 ? '9px' : '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backdropFilter: 'blur(4px)',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
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
                  maxWidth: '90px',
                  display: 'inline-block',
                  verticalAlign: 'bottom',
                }}
                title={item.name}
              >
                {item.name}
              </span>
              <span style={{ color: item.color, fontWeight: 700 }}>
                {Number(item.value).toFixed(0)}%
              </span>
            </div>
          </div>
        </foreignObject>
      ))}
    </g>
  );
}


