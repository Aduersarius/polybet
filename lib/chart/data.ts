import type { ColoredOutcome } from './colors';

export type OddsHistoryPoint = {
  timestamp: number;
  yesPrice?: number;
  outcomes?: Array<{ id: string; name: string; probability: number; color?: string }>;
  [key: string]: any; // Allow flat format with outcome_xxx keys
};

export type BinaryChartPoint = { timestamp: number; value: number };
export type MultiChartPoint = { timestamp: number } & Record<string, number>;

export function toBinaryChartData(history: OddsHistoryPoint[]): BinaryChartPoint[] {
  return history.map((d) => ({
    timestamp: d.timestamp,
    value: (d.yesPrice || 0) * 100,
  }));
}

export function toMultiChartData(
  history: OddsHistoryPoint[],
  coloredOutcomes: Array<ColoredOutcome<{ id: string; name: string; probability: number }>>,
): MultiChartPoint[] {
  return history.map((d) => {
    const base: any = { timestamp: d.timestamp };
    coloredOutcomes.forEach((o) => {
      // Check if data is in flat format (already has outcome_xxx keys)
      const flatKey = `outcome_${o.id}`;
      if ((d as any)[flatKey] !== undefined) {
        // Data is already in flat format, just convert to percentage
        base[flatKey] = (d as any)[flatKey] * 100;
      } else {
        // Data is in nested outcomes array format
        const match = d.outcomes?.find((x) => x.id === o.id);
        base[flatKey] = (match?.probability || 0) * 100;
      }
    });
    return base as MultiChartPoint;
  });
}


