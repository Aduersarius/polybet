import { format } from 'date-fns';
import type { OddsPeriod } from '@/app/components/charts/axis/TimelineTick';

export function formatCursorTimestamp(tsSeconds: number, period: OddsPeriod): string {
  const date = new Date(tsSeconds * 1000);
  if (period === '6h') return format(date, 'h:mm a');
  if (period === '1d') return format(date, 'MMM d, ha');
  if (period === '1w') return format(date, 'MMM d, h a');
  if (period === '1m' || period === '3m') return format(date, 'MMM d, yyyy');
  return format(date, 'MMM d, yyyy h:mm a');
}


