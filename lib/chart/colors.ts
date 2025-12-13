export const OUTCOME_COLORS = [
  '#BB86FC', // Primary purple
  '#03DAC6', // Cyan/Teal
  '#CF6679', // Pink/Red
  '#8B5CF6', // Secondary purple
  '#10B981', // Green
  '#F59E0B', // Orange
  '#3B82F6', // Blue
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F43F5E', // Rose
  '#84CC16', // Lime
  '#D946EF', // Fuchsia
  '#06B6D4', // Cyan
];

export type OutcomeBase = { id: string; name: string; probability: number };
export type ColoredOutcome<T extends OutcomeBase = OutcomeBase> = T & { color: string };

export function assignOutcomeColors<T extends OutcomeBase>(outcomes: T[]): Array<ColoredOutcome<T>> {
  return outcomes.map((o, idx) => ({
    ...o,
    color: OUTCOME_COLORS[idx % OUTCOME_COLORS.length],
  }));
}


