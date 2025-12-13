import type { ColoredOutcome } from './colors';

export type OddsHistoryPoint = {
  timestamp: number;
  yesPrice?: number;
  outcomes?: Array<{ id: string; name: string; probability: number; color?: string }>;
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
      const match = d.outcomes?.find((x) => x.id === o.id);
      base[`outcome_${o.id}`] = (match?.probability || 0) * 100;
    });
    return base as MultiChartPoint;
  });
}


