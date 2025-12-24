'use client';

import { useEffect, useRef } from 'react';

/**
 * Recharts renders tooltip content during chart render; updating React state there can cause warnings.
 * This bridge updates hovered datapoint asynchronously.
 * 
 * IMPORTANT: We use a ref to track the last timestamp and only call onHover when
 * the timestamp actually changes. This prevents infinite render loops that occur
 * because the `payload` array is a new reference on every Recharts render.
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
  const lastTimestampRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract current timestamp from payload (without using useMemo which would still
  // recalculate on every render due to payload being a new array)
  const currentPayload = active && payload && payload.length > 0 ? payload[0]?.payload : null;
  const currentTimestamp = currentPayload?.timestamp ?? null;

  // Use a synchronous check + deferred update to avoid render-phase state updates
  // while still preventing infinite loops
  const timestampChanged = currentTimestamp !== lastTimestampRef.current;

  if (timestampChanged) {
    lastTimestampRef.current = currentTimestamp;

    // Clear any pending update
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
    }

    // Schedule the update for after the render phase
    // Using setTimeout(0) to break out of the React render cycle
    pendingUpdateRef.current = setTimeout(() => {
      onHover(currentPayload);
      pendingUpdateRef.current = null;
    }, 0);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, []);

  return null;
}
