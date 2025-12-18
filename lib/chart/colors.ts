/**
 * Chart Colors - Now using centralized color system
 * Re-exports from lib/colors for backward compatibility
 */

import { getOutcomeColor, colorTokens } from '@/lib/colors';

// Re-export outcome colors from centralized system
export const OUTCOME_COLORS = colorTokens.outcomes;

export type OutcomeBase = { id: string; name: string; probability: number };
export type ColoredOutcome<T extends OutcomeBase = OutcomeBase> = T & { color: string };

export function assignOutcomeColors<T extends OutcomeBase>(outcomes: T[]): Array<ColoredOutcome<T>> {
  return outcomes.map((o, idx) => ({
    ...o,
    color: getOutcomeColor(idx),
  }));
}


