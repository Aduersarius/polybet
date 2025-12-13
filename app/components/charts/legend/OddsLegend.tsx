'use client';

import { motion } from 'framer-motion';
import type { ColoredOutcome } from '@/lib/chart/colors';

export function OddsLegend({
  isMultipleOutcomes,
  coloredOutcomes,
  hoveredDataPoint,
  currentValues,
  binaryValue,
}: {
  isMultipleOutcomes: boolean;
  coloredOutcomes: Array<ColoredOutcome<{ id: string; name: string; probability: number }>>;
  hoveredDataPoint: any | null;
  currentValues: Record<string, number>;
  binaryValue: number;
}) {
  if (isMultipleOutcomes) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        {coloredOutcomes.map((o) => {
          const value = hoveredDataPoint ? (hoveredDataPoint[`outcome_${o.id}`] || 0) : (currentValues[`outcome_${o.id}`] || 0);
          return (
            <motion.div key={o.id} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: o.color }} />
              <span className="text-xs font-medium text-gray-300">{o.name}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: o.color }}>
                {Math.round(value)}%
              </span>
            </motion.div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-[#BB86FC]" />
        <span className="text-xs font-medium text-gray-300">Yes</span>
        <span className="text-sm font-bold text-[#BB86FC] tabular-nums">{Math.round(binaryValue)}%</span>
      </div>
    </div>
  );
}


