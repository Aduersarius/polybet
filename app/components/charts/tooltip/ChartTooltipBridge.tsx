'use client';

import { useEffect } from 'react';

/**
 * Recharts renders tooltip content during chart render; updating React state there can cause warnings.
 * This bridge updates hovered datapoint asynchronously.
 */
export function ChartTooltipBridge({
  active,
  payload,
  onHover,
}: {
  active?: boolean;
  payload?: any[];
  onHover: (dataPoint: any | null) => void;
}) {
  useEffect(() => {
    if (active && payload && payload.length > 0) {
      onHover(payload[0]?.payload ?? null);
    } else {
      onHover(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, payload]);

  return null;
}


