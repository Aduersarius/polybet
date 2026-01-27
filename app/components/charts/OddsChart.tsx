'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { OutcomeSelector } from './controls/OutcomeSelector';
import { ChartTooltipBridge } from './tooltip/ChartTooltipBridge';
import { OddsCursor } from './cursor/OddsCursor';
import { MultipleOddsCursor } from './cursor/MultipleOddsCursor';

import { assignOutcomeColors } from '@/lib/chart/colors';
import { toBinaryChartData, toMultiChartData } from '@/lib/chart/data';
import { computeXAxisDomain, computeYAxisDomain } from '@/lib/chart/domains';
import { computeCustomDailyTicks } from '@/lib/chart/ticks';
import { useOddsHistory } from '@/hooks/use-odds-history';
import { useOddsRealtime } from '@/hooks/use-odds-realtime';

export type OddsChartV2Props = {
  eventId: string;
  eventType: 'BINARY' | 'MULTIPLE' | 'GROUPED_BINARY';
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

export function OddsChartV2({ eventId: propEventId, eventType, outcomes, liveOutcomes, currentYesPrice }: OddsChartV2Props) {
  // Resolve event ID if slug provided
  const [resolvedEventId, setResolvedEventId] = useState<string>(propEventId);

  useEffect(() => {
    if (!propEventId) return;
    if (propEventId.length === 36) { // Assume UUID
      setResolvedEventId(propEventId);
      return;
    }

    // Try to fetch event data to get the ID
    fetch(`/api/events/${propEventId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.id) {
          setResolvedEventId(data.id);
        }
      })
      .catch(err => console.error('[OddsChartV2] ID resolution failed:', err));
  }, [propEventId]);

  const [period, setPeriod] = useState<OddsPeriod>('all');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<any | null>(null);
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<Set<string>>(new Set());

  const effectiveOutcomes = liveOutcomes || outcomes;
  const isMultipleOutcomes = (eventType === 'MULTIPLE' || eventType === 'GROUPED_BINARY') && Array.isArray(effectiveOutcomes) && effectiveOutcomes.length > 0;
  const hasMany = isMultipleOutcomes && effectiveOutcomes.length > 4;

  const coloredOutcomes = useMemo(() => (isMultipleOutcomes ? assignOutcomeColors(effectiveOutcomes) : []), [effectiveOutcomes, isMultipleOutcomes]);

  // Initialize selected outcomes: top 4 by probability when there are many
  useEffect(() => {
    if (hasMany && selectedOutcomeIds.size === 0) {
      const sorted = [...effectiveOutcomes].sort((a, b) => b.probability - a.probability);
      const top4Ids = sorted.slice(0, 4).map(o => o.id);
      setSelectedOutcomeIds(new Set(top4Ids));
    } else if (!hasMany && isMultipleOutcomes) {
      // Show all when less than 4
      setSelectedOutcomeIds(new Set(effectiveOutcomes.map(o => o.id)));
    }
  }, [hasMany, effectiveOutcomes, isMultipleOutcomes]);

  // Filter outcomes based on selection (only when 4+)
  const visibleOutcomes = useMemo(() => {
    if (!hasMany) return coloredOutcomes;

    const filtered = coloredOutcomes.filter(o => selectedOutcomeIds.has(o.id));

    // SAFETY FALLBACK: If filtering results in 0 items, show ALL outcomes instead of a blank chart.
    // This handles race conditions where selectedOutcomeIds hasn't initialized yet.
    if (filtered.length === 0 && coloredOutcomes.length > 0) {
      return coloredOutcomes;
    }

    return filtered;
  }, [coloredOutcomes, selectedOutcomeIds, hasMany]);

  const toggleOutcome = useCallback((id: string) => {
    setSelectedOutcomeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow deselecting all
        if (next.size > 1) {
          next.delete(id);
        }
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderCap = useMemo(() => renderCapForPeriod(period), [period]);

  const { data: history, setData, isLoading } = useOddsHistory(resolvedEventId, period);
  useOddsRealtime({ eventId: resolvedEventId, eventType, isMultipleOutcomes, setData, maxPoints: 500 });

  const chartData = useMemo(() => {
    if (isMultipleOutcomes) {
      return toMultiChartData(history as any, coloredOutcomes as any);
    }
    return toBinaryChartData(history as any);
  }, [history, isMultipleOutcomes, coloredOutcomes]);

  const renderData = useMemo(() => limitPoints(chartData as any[], renderCap), [chartData, renderCap]);



  const outcomeKeys = useMemo(() => visibleOutcomes.map((o) => `outcome_${o.id}`), [visibleOutcomes]);

  const sanitizedId = (id: string) => `id_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const yAxisDomain = useMemo(
    () => computeYAxisDomain({ chartData: chartData as any[], isMultipleOutcomes, outcomeKeys }),
    [chartData, isMultipleOutcomes, outcomeKeys],
  );

  const xAxisDomain = useMemo(() => computeXAxisDomain(renderData as any[]), [renderData]);
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

  const chartMargin = useMemo(() => ({
    top: isMultipleOutcomes ? (hasMany ? 10 : 60) : 0,
    right: 0,
    left: -40,
    bottom: 15
  }), [isMultipleOutcomes, hasMany]);
  const yAxisPadding = useMemo(() => ({ top: 32, bottom: 32 }), []);

  return (
    <div
      className="flex flex-col relative h-full w-full bg-[#1a1d28] select-none cursor-crosshair outline-none ring-0 focus:outline-none active:outline-none"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* External Outcome Selector for large sets */}
      {hasMany && (
        <OutcomeSelector
          outcomes={coloredOutcomes}
          selectedIds={selectedOutcomeIds}
          onToggle={toggleOutcome}
          currentValues={currentValues}
          hoveredDataPoint={hoveredDataPoint}
        />
      )}

      <div className="flex-1 relative w-full" style={{ minHeight: "300px" }}>
        <div className="absolute inset-0">
          {isLoading && history.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#BB86FC]" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={renderData as any[]} margin={chartMargin}>
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
                  padding={yAxisPadding}
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
                    isMultipleOutcomes ? (
                      <MultipleOddsCursor
                        period={period}
                        yDomain={yAxisDomain as any}
                        resolveSeriesMeta={resolveSeriesMeta}
                        padding={yAxisPadding}
                      />
                    ) : (
                      <OddsCursor
                        period={period}
                        yDomain={yAxisDomain as any}
                        resolveSeriesMeta={resolveSeriesMeta}
                        padding={yAxisPadding}
                      />
                    )
                  }
                  isAnimationActive={false}
                  animationDuration={0}
                />

                {isMultipleOutcomes ? (
                  visibleOutcomes.map((o) => (
                    <Area
                      key={o.id}
                      type="monotone"
                      dataKey={`outcome_${o.id}`}
                      stroke={o.color}
                      strokeWidth={2.5}
                      fill={o.color}
                      fillOpacity={0.2}
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
                    fill="#8B5CF6"
                    fillOpacity={0.2}
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
                    visibleOutcomes.map((o) => (
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
      </div>

      {/* Internal Overlay Legend (Only for small multiple sets) */}
      {isMultipleOutcomes && !hasMany && (
        <div className="absolute top-3 left-4 right-4 flex items-start justify-between pointer-events-none">
          <div className="pointer-events-auto rounded-lg bg-[#1a1d28] backdrop-blur-sm px-3 py-2 flex flex-col gap-2 border border-white/10 max-w-[90%]">
            <div className="flex flex-wrap items-center gap-3">
              {coloredOutcomes.map((o) => {
                const value = hoveredDataPoint ? (hoveredDataPoint[`outcome_${o.id}`] || 0) : (currentValues[`outcome_${o.id}`] || 0);

                return (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: o.color }}
                    />
                    <span className="text-xs font-medium text-gray-300 truncate max-w-[80px]">{o.name}</span>
                    <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: o.color }}>
                      {Math.round(value)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none">
        <PeriodSelector period={period} onChange={setPeriod} />

        <div className="pointer-events-auto flex gap-1 rounded-lg bg-[#1a1d28]/80 backdrop-blur-sm p-2">
          <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity select-none">
            <img src="/diamond_logo_nobg.png" alt="Pariflow" className="h-6 w-6 object-contain" />
            <span className="text-xs font-bold tracking-wider bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              PARIFLOW
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


