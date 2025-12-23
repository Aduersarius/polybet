'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { OddsPeriod } from './axis/TimelineTick';
import { TimelineTick } from './axis/TimelineTick';
import { PeriodSelector } from './controls/PeriodSelector';
import { OddsLegend } from './legend/OddsLegend';
import { ChartTooltipBridge } from './tooltip/ChartTooltipBridge';
import { OddsCursor } from './cursor/OddsCursor';

import { assignOutcomeColors } from '@/lib/chart/colors';
import { toBinaryChartData, toMultiChartData } from '@/lib/chart/data';
import { computeXAxisDomain, computeYAxisDomain } from '@/lib/chart/domains';
import { computeCustomDailyTicks } from '@/lib/chart/ticks';
import { useOddsHistory } from '@/hooks/use-odds-history';
import { useOddsRealtime } from '@/hooks/use-odds-realtime';

export type OddsChartV2Props = {
  eventId: string;
  eventType: 'BINARY' | 'MULTIPLE';
  outcomes: Array<{ id: string; name: string; probability: number }>;
  liveOutcomes?: Array<{ id: string; name: string; probability: number }>;
  currentYesPrice?: number;
};

function limitPoints<T>(data: T[], maxPoints: number): T[] {
  if (!Array.isArray(data) || data.length <= maxPoints) return data;
  const stride = Math.ceil(data.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < data.length; i += stride) {
    result.push(data[i]);
  }
  const last = data[data.length - 1];
  if (result[result.length - 1] !== last) {
    result[result.length - 1] = last;
  }
  return result;
}

function renderCapForPeriod(period: OddsPeriod) {
  // Lower the render budget on longer ranges to keep UI responsive on older events
  // while still fetching/storing the full 500-point history.
  switch (period) {
    case '6h':
      return 440;
    case '1d':
      return 420;
    case '1w':
      return 400;
    case '1m':
      return 360;
    case '3m':
      return 320;
    case 'all':
      return 260;
    default:
      return 480;
  }
}

export function OddsChartV2({ eventId, eventType, outcomes, liveOutcomes, currentYesPrice }: OddsChartV2Props) {
  const [period, setPeriod] = useState<OddsPeriod>('all');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<any | null>(null);

  const effectiveOutcomes = liveOutcomes || outcomes;
  const isMultipleOutcomes = eventType === 'MULTIPLE' && Array.isArray(effectiveOutcomes) && effectiveOutcomes.length > 0;
  const coloredOutcomes = useMemo(() => (isMultipleOutcomes ? assignOutcomeColors(effectiveOutcomes) : []), [effectiveOutcomes, isMultipleOutcomes]);

  const renderCap = useMemo(() => renderCapForPeriod(period), [period]);

  const { data: history, setData, isLoading } = useOddsHistory(eventId, period);
  useOddsRealtime({ eventId, eventType, isMultipleOutcomes, setData, maxPoints: 500 });

  const chartData = useMemo(() => {
    if (isMultipleOutcomes) {
      return toMultiChartData(history as any, coloredOutcomes as any);
    }
    return toBinaryChartData(history as any);
  }, [history, isMultipleOutcomes, coloredOutcomes]);

  const renderData = useMemo(() => limitPoints(chartData as any[], renderCap), [chartData, renderCap]);

  const outcomeKeys = useMemo(() => coloredOutcomes.map((o) => `outcome_${o.id}`), [coloredOutcomes]);

  const yAxisDomain = useMemo(
    () => computeYAxisDomain({ chartData: chartData as any[], isMultipleOutcomes, outcomeKeys }),
    [chartData, isMultipleOutcomes, outcomeKeys],
  );

  const xAxisDomain = useMemo(() => computeXAxisDomain(chartData as any[]), [chartData]);
  const customTicks = useMemo(() => computeCustomDailyTicks(renderData as any[], period), [renderData, period]);

  const currentValues = useMemo(() => {
    if (!isMultipleOutcomes) return {};
    const values: Record<string, number> = {};

    // Use the last point from chartData (which includes real-time updates)
    // This is the source of truth - real-time updates are added via useOddsRealtime
    if (chartData.length > 0) {
      const lastPoint: any = chartData[chartData.length - 1];
      coloredOutcomes.forEach((o) => {
        values[`outcome_${o.id}`] = lastPoint?.[`outcome_${o.id}`] ?? 0;
      });
    }
    return values;
  }, [chartData, coloredOutcomes, isMultipleOutcomes]);

  const binaryValue = hoveredDataPoint ? (hoveredDataPoint.value || 0) : ((currentYesPrice || 0) * 100);

  const resolveSeriesMeta = (dataKey: string) => {
    if (!isMultipleOutcomes) return { name: 'Yes', color: '#BB86FC' };
    const outcomeId = dataKey?.replace('outcome_', '');
    const found = coloredOutcomes.find((o) => o.id === outcomeId);
    return found ? { name: found.name, color: found.color } : { name: dataKey, color: '#BB86FC' };
  };

  // Show pulses when not hovered and dataset is reasonably small to avoid DOM cost.
  const showCurrentPulse = hoveredDataPoint == null && renderData.length <= Math.max(420, renderCap + 20);

  // Use the last point from chartData for pulse markers - this ensures lines and markers match
  // Since chartData is already updated with liveOutcomes, this will be consistent
  const lastPoint = useMemo(() => {
    if (!showCurrentPulse || renderData.length === 0) return undefined;
    return renderData[renderData.length - 1];
  }, [showCurrentPulse, renderData]);

  const handleHover = useCallback(
    (dp: any | null) => {
      setHoveredDataPoint((prev: any) => {
        if (!dp) return null;
        if (prev?.timestamp != null && dp?.timestamp != null && prev.timestamp === dp.timestamp) return prev;
        return dp;
      });
    },
    [],
  );

  const PulseDotShape = ({ cx, cy, stroke }: any) => {
    if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
    const color = typeof stroke === 'string' ? stroke : '#BB86FC';
    return (
      <g style={{ pointerEvents: 'none' }}>
        <circle cx={cx} cy={cy} r={5} fill="#1a1d29" stroke={color} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={5} fill="none" stroke={color} strokeWidth={2} opacity={0.6}>
          <animate attributeName="r" values="5;12" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  };

  return (
    <div
      className="relative h-full w-full bg-[#1a1d28] select-none cursor-crosshair outline-none ring-0 focus:outline-none active:outline-none"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0">
        {isLoading && history.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#BB86FC]" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={renderData as any[]} margin={{ top: 0, right: 0, left: -40, bottom: 15 }}>
              <defs>
                {isMultipleOutcomes ? (
                  coloredOutcomes.map((o) => (
                    <linearGradient key={o.id} id={`gradient_${o.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={o.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={o.color} stopOpacity={0} />
                    </linearGradient>
                  ))
                ) : (
                  <linearGradient id="gradientValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                )}
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical horizontal />

              <XAxis
                dataKey="timestamp"
                type="number"
                domain={xAxisDomain as any}
                tick={(props: any) => <TimelineTick {...props} period={period} />}
                ticks={customTicks}
                padding={{ left: 0, right: 0 }}
                tickLine={false}
                axisLine={{ stroke: '#3B4048', strokeWidth: 2 }}
                height={45}
                tickMargin={0}
                interval="preserveStartEnd"
              />

              <YAxis
                orientation="right"
                domain={yAxisDomain as any}
                stroke="#6B7280"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                mirror
                tickCount={6}
                tick={({ x, y, payload, index, visibleTicksCount }: any) => {
                  if (index === 0 || index === visibleTicksCount - 1) return null;
                  return (
                    <text x={x} y={y} dy={4} textAnchor="end" fill="#6B7280" fontSize={11}>
                      {payload.value}%
                    </text>
                  );
                }}
              />

              <Tooltip
                content={
                  <ChartTooltipBridge
                    onHover={handleHover}
                  />
                }
                cursor={
                  <OddsCursor
                    period={period}
                    yDomain={yAxisDomain as any}
                    resolveSeriesMeta={resolveSeriesMeta}
                  />
                }
                isAnimationActive={false}
                animationDuration={0}
              />

              {isMultipleOutcomes ? (
                coloredOutcomes.map((o) => (
                  <Area
                    key={o.id}
                    type="monotone"
                    dataKey={`outcome_${o.id}`}
                    stroke={o.color}
                    strokeWidth={2.5}
                    fill={`url(#gradient_${o.id})`}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-in-out"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: o.color, fill: '#1a1d29' }}
                  />
                ))
              ) : (
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  fill="url(#gradientValue)"
                  isAnimationActive={true}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#8B5CF6', fill: '#1a1d29' }}
                />
              )}

              {/* Current point pulse markers (rendered after series so they sit on top) */}
              {showCurrentPulse && lastPoint ? (
                isMultipleOutcomes ? (
                  coloredOutcomes.map((o) => (
                    <ReferenceDot
                      key={`pulse_${o.id}`}
                      x={lastPoint.timestamp}
                      y={lastPoint[`outcome_${o.id}`]}
                      r={5}
                      stroke={o.color}
                      fill="#1a1d29"
                      shape={PulseDotShape}
                    />
                  ))
                ) : (
                  <ReferenceDot
                    x={lastPoint.timestamp}
                    y={lastPoint.value}
                    r={5}
                    stroke="#8B5CF6"
                    fill="#1a1d29"
                    shape={PulseDotShape}
                  />
                )
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Header */}
      <div className="absolute top-3 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto rounded-lg bg-[#1a1d28] backdrop-blur-sm px-3 py-2 flex flex-col items-end border border-white/10">
          <OddsLegend
            isMultipleOutcomes={isMultipleOutcomes}
            coloredOutcomes={coloredOutcomes as any}
            hoveredDataPoint={hoveredDataPoint}
            currentValues={currentValues}
            binaryValue={binaryValue}
          />
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none">
        <PeriodSelector period={period} onChange={setPeriod} />

        <div className="pointer-events-auto flex gap-1 rounded-lg bg-[#1a1d28]/80 backdrop-blur-sm p-2">
          <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity select-none">
            <img src="/diamond_logo_nobg.png" alt="PolyBet" className="h-6 w-6 object-contain" />
            <span className="text-xs font-bold tracking-wider bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              POLYBET
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


