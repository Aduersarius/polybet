'use client';

import { useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OddsHistoryPoint } from '@/lib/chart/data';
import type { OddsPeriod } from '@/app/components/charts/axis/TimelineTick';

const ALL_PERIODS: OddsPeriod[] = ['1d', '1w', '1m', '3m', 'all'];

/**
 * Odds history with react-query caching/deduping.
 * Real-time updates can push data via the returned `setData`, which writes
 * through to the query cache so other consumers stay in sync.
 */
export function useOddsHistory(eventId: string, period: OddsPeriod) {
  const queryClient = useQueryClient();

  const prefetchedRef = useRef<string | null>(null);

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
        cache: 'no-store', // avoid stale ms timestamps for long ranges
      });
      if (!res.ok) throw new Error(`odds-history ${res.status}`);
      const json = await res.json();
      return Array.isArray(json?.data) ? (json.data as OddsHistoryPoint[]) : [];
    },
  });

  /**
   * BACKGROUND PREFETCHING:
   * triggered after the "all" range (primary load) is successful.
   * This ensures the main chart is snappy, then quietly prepares other tabs.
   */
  useEffect(() => {
    if (!eventId || period !== 'all' || !query.isSuccess || prefetchedRef.current === eventId) return;

    // Wait 2s after main load to start background work
    const timer = setTimeout(() => {
      prefetchedRef.current = eventId;

      const otherPeriods = ALL_PERIODS.filter(p => p !== 'all');

      otherPeriods.forEach((p) => {
        queryClient.prefetchQuery({
          queryKey: ['odds-history', eventId, p],
          staleTime: 30_000,
          queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}/odds-history?period=${p}`, {
              headers: { 'x-cache-prefetch': '1' },
              cache: 'no-store',
            });
            if (!res.ok) throw new Error(`odds-history ${res.status}`);
            const json = await res.json();
            return Array.isArray(json?.data) ? (json.data as OddsHistoryPoint[]) : [];
          },
        });
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [eventId, period, query.isSuccess, queryClient]);


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

