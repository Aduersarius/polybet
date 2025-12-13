'use client';

import { useEffect } from 'react';
import type { OddsHistoryPoint } from '@/lib/chart/data';

export function useOddsRealtime(opts: {
  eventId: string;
  eventType: 'BINARY' | 'MULTIPLE';
  isMultipleOutcomes: boolean;
  setData: React.Dispatch<React.SetStateAction<OddsHistoryPoint[]>>;
}) {
  const { eventId, eventType, isMultipleOutcomes, setData } = opts;

  useEffect(() => {
    if (!eventId) return;

    // Lazy require to avoid SSR issues (matches existing pattern)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { socket } = require('@/lib/socket');

    const handler = (update: any) => {
      if (update?.eventId !== eventId) return;

      setData((prev) => {
        const newPoint: OddsHistoryPoint = {
          timestamp: update.timestamp,
          ...(isMultipleOutcomes ? { outcomes: update.outcomes } : { yesPrice: update.yesPrice }),
        };
        return [...prev, newPoint];
      });
    };

    socket.on(`odds-update-${eventId}`, handler);
    return () => {
      socket.off(`odds-update-${eventId}`, handler);
    };
  }, [eventId, eventType, isMultipleOutcomes, setData]);
}


