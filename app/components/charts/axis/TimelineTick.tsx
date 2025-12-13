'use client';

import * as React from 'react';
import { format } from 'date-fns';

export type OddsPeriod = '6h' | '1d' | '1w' | '1m' | '3m' | 'all';

export const formatTickLabel = (date: Date, period: OddsPeriod): string => {
  if (period === '6h') return format(date, 'h:mm a');
  if (period === '1d') return format(date, 'ha');
  if (period === '1w') return format(date, 'MMM d');
  if (period === '1m' || period === '3m' || period === 'all') return format(date, 'MMM d');
  return format(date, 'MMM');
};

type TimelineTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: number };
  period: OddsPeriod;
};

export const TimelineTick = (props: TimelineTickProps) => {
  const { x = 0, y = 0, payload, period } = props;
  const date = new Date(((payload?.value ?? 0) as number) * 1000);
  const label = formatTickLabel(date, period);

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={-20} textAnchor="middle" fill="#6B7280" fontSize={11}>
        {label}
      </text>
      <circle
        cx={0}
        cy={-5}
        r={4}
        fill="#3B4048"
        stroke="#4B5563"
        strokeWidth={1}
      />
    </g>
  );
};


