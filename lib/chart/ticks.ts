import { addDays, startOfDay } from 'date-fns';
import type { OddsPeriod } from '@/app/components/charts/axis/TimelineTick';

export function computeCustomDailyTicks(chartData: any[], period: OddsPeriod): number[] | undefined {
  if (!chartData || chartData.length === 0) return undefined;
  if (!['1w', '1m', '3m', 'all'].includes(period)) return undefined;

  const minTime = chartData[0].timestamp * 1000;
  const maxTime = chartData[chartData.length - 1].timestamp * 1000;

  const ticks: number[] = [];
  let current = startOfDay(new Date(minTime));

  while (current.getTime() <= maxTime) {
    const ts = current.getTime();
    if (ts >= minTime) ticks.push(ts / 1000);
    current = addDays(current, 1);
  }

  return ticks.length > 0 ? ticks : undefined;
}


