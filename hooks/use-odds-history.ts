'use client';

import { useMemo } from 'react';
import type React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OddsHistoryPoint } from '@/lib/chart/data';
import type { OddsPeriod } from '@/app/components/charts/axis/TimelineTick';

/**
 * Odds history with react-query caching/deduping.
 * Real-time updates can push data via the returned `setData`, which writes
 * through to the query cache so other consumers stay in sync.
 */
export function useOddsHistory(eventId: string, period: OddsPeriod) {
  const queryClient = useQueryClient();

  const query = useQuery<OddsHistoryPoint[]>({
    queryKey: ['odds-history', eventId, period],
    enabled: Boolean(eventId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/events/${eventId}/odds-history?period=${period}`, {
        signal,
        headers: { 'x-cache-prefetch': '1' },
        cache: 'force-cache',
      });
      if (!res.ok) throw new Error(`odds-history ${res.status}`);
      const json = await res.json();
      return Array.isArray(json?.data) ? (json.data as OddsHistoryPoint[]) : [];
    },
  });

  const setData = useMemo(
    () =>
      (updater: React.SetStateAction<OddsHistoryPoint[]>) => {
        queryClient.setQueryData<OddsHistoryPoint[]>(
          ['odds-history', eventId, period],
          (prev = []) => (typeof updater === 'function' ? (updater as any)(prev) : updater),
        );
      },
    [eventId, period, queryClient],
  );

  return {
    data: query.data || [],
    setData,
    isLoading: query.isFetching && !query.data,
    error: query.error,
  };
}

