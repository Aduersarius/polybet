'use client';

import { useEffect, useState } from 'react';
import type { OddsHistoryPoint } from '@/lib/chart/data';
import type { OddsPeriod } from '@/app/components/charts/axis/TimelineTick';

export function useOddsHistory(eventId: string, period: OddsPeriod) {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<OddsHistoryPoint[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!eventId) return;

    const controller = new AbortController();
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/events/${eventId}/odds-history?period=${period}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        const history = json?.data || [];
        setData(history);
      } catch (e) {
        // Ignore aborts
        if ((e as any)?.name === 'AbortError') return;
        setError(e);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [eventId, period]);

  return { data, setData, isLoading, error };
}


