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
  return history.map((d) => {
    let val = d.yesPrice;
    if (val === undefined && d.outcomes) {
      // Try to find a "Yes" outcome
      const yes = d.outcomes.find(o => /^yes$/i.test(o.name) || /^Yes /i.test(o.name));
      if (yes) val = yes.probability;
    }
    return {
      timestamp: d.timestamp,
      value: (val || 0) * 100,
    };
  });
}



// Helper to normalize names for loose matching
const norm = (s: string) => s.trim().toLowerCase();

export function toMultiChartData(
  history: OddsHistoryPoint[],
  coloredOutcomes: Array<ColoredOutcome<{ id: string; name: string; probability: number }>>,
): MultiChartPoint[] {
  return history.map((d) => {
    const base: any = { timestamp: d.timestamp };

    coloredOutcomes.forEach((o, oIdx) => {
      const flatKey = `outcome_${o.id}`;

      // 1. Check if data is in flat format (already has outcome_xxx keys)
      if ((d as any)[flatKey] !== undefined) {
        base[flatKey] = (d as any)[flatKey] * 100;
        return;
      }

      // 2. Check nested outcomes array
      if (d.outcomes) {
        // A. Try Exact ID Match (Best)
        let match = d.outcomes.find((x) => x.id === o.id);

        // B. Try Exact Name Match (Backup)
        if (!match) {
          match = d.outcomes.find((x) => x.name === o.name);
        }

        // C. Try Normalized Name Match (Last Resort)
        if (!match) {
          const targetName = norm(o.name);
          match = d.outcomes.find((x) => norm(x.name) === targetName);
        }

        // D. Special Case: If ID looks like a synthetic index-based ID (e.g. from intake), attempt index match
        // Often IDs are like 'pm-{hash}-0', 'pm-{hash}-1'
        if (!match && (o.id.includes('-') || /^\d+$/.test(o.id))) {
          // If history outcomes are sorted by probability or some other metric, this is risky,
          // but if we are desperate and the count matches, try index.
          // Only do this if outcome counts match exactly to avoid misalignment.
          if (d.outcomes.length === coloredOutcomes.length) {
            match = d.outcomes[oIdx];
          }
        }

        base[flatKey] = (match?.probability || 0) * 100;
      } else {
        base[flatKey] = 0;
      }
    });
    return base as MultiChartPoint;
  });
}


