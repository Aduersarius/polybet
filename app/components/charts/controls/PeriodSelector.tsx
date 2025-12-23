'use client';

import { motion } from 'framer-motion';
import type { OddsPeriod } from '../axis/TimelineTick';

const TIME_PERIODS: Array<{ label: string; value: OddsPeriod }> = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: 'ALL', value: 'all' },
];

export function PeriodSelector({
  period,
  onChange,
}: {
  period: OddsPeriod;
  onChange: (p: OddsPeriod) => void;
}) {
  return (
    <div className="pointer-events-auto flex gap-1 rounded-lg bg-[#1a1d28]/80 backdrop-blur-sm p-1">
      {TIME_PERIODS.map((tp) => (
        <motion.button
          key={tp.value}
          onClick={() => onChange(tp.value)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`rounded px-3 py-1 text-xs font-semibold transition-all ${period === tp.value
              ? 'bg-[#BB86FC] text-white shadow-lg shadow-[#BB86FC]/30'
              : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
        >
          {tp.label}
        </motion.button>
      ))}
    </div>
  );
}


