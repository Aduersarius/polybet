'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pagination } from './Pagination';

type IntakeItem = {
  polymarketId: string;
  polymarketEventId?: string;
  polymarketSlug?: string; // URL slug for Polymarket links
  variantCount?: number;
  conditionId?: string;
  question?: string;
  title?: string;
  description?: string;
  rules?: string;
  resolutionSource?: string;
  categories: string[];
  category?: string;
  image?: string | null;
  endDate?: string;
  startDate?: string;
  createdAt?: string;
  volume?: number;
  volume24hr?: number;
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  acceptingOrders?: boolean;
  enableOrderBook?: boolean;
  tokens: Array<{ tokenId: string; outcome?: string; price?: number }>;
  outcomes: Array<{ id?: string; name: string; price?: number; probability?: number }>;
  status: string;
  internalEventId?: string;
  notes?: string | null;
  // Event type classification
  marketType?: 'BINARY' | 'MULTIPLE' | 'GROUPED_BINARY';
  isGroupedBinary?: boolean;
};

type ModalState = null | { type: 'reject'; item: IntakeItem } | { type: 'approve'; item: IntakeItem };

export function AdminPolymarketIntake() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<{ internalEventId: string; tokenId: string; notes: string }>({
    internalEventId: '',
    tokenId: '',
    notes: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [forcedTypes, setForcedTypes] = useState<Record<string, 'MULTIPLE' | 'GROUPED_BINARY'>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  // Pagination, Filtering, Sorting state
  const [statusFilter, setStatusFilter] = useState<'all' | 'unmapped' | 'approved' | 'rejected'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | '2' | '3-5' | '6+'>('all');
  const [sortBy, setSortBy] = useState<'volume' | 'date' | 'title'>('volume');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    // Click outside to close dropdowns
    const handleClickOutside = () => setOpenDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const makeRandomInternalId = () => {
    // 9-digit random integer as string
    return String(Math.floor(100_000_000 + Math.random() * 900_000_000));
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      if (debouncedSearch) setItems([]); // Clear on search to show fresh state

      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const url = `/api/polymarket/intake?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load intake data');
      const data = (await res.json()) as IntakeItem[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // WebSocket live updates (best-effort; if it fails we fall back to manual refresh)
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    const url = 'wss://ws-live-data.polymarket.com';
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to orderbook and market updates
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['markets'] }));
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['orderbook'] }));
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          // If markets or orderbooks update, re-fetch intake list (lightweight)
          if (data?.type === 'markets' || data?.type === 'orderbook') {
            load();
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        console.warn('[Polymarket WS] error, closing');
        ws.close();
      };

      return () => {
        ws.close();
        wsRef.current = null;
      };
    } catch (err) {
      console.warn('[Polymarket WS] failed to connect', err);
      return () => { };
    }
  }, []);

  const resolveTokenForOutcome = (item: IntakeItem, idx: number, name?: string) => {
    const tokens = item.tokens || [];
    const normalizedName = name?.trim().toLowerCase();

    // For binary markets (YES/NO), ALWAYS match by name to avoid swap
    const isBinaryOutcome = normalizedName === 'yes' || normalizedName === 'no';

    // First try exact name match on token's outcome field
    const byName = normalizedName
      ? tokens.find((t) => t.outcome && t.outcome.trim().toLowerCase() === normalizedName)
      : undefined;
    if (byName?.tokenId) return byName.tokenId;

    // For binary YES/NO outcomes, try the opposite if exact match fails
    // This handles cases where token.outcome might be capitalized differently
    if (isBinaryOutcome) {
      const byPartialName = tokens.find((t) => {
        if (!t.outcome) return false;
        const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^${escapedName}$`, 'i').test(t.outcome.trim());
      });
      if (byPartialName?.tokenId) return byPartialName.tokenId;

      // If still not found, DON'T fall back to index for binary markets
      // as this causes the YES/NO swap
      console.warn(`[Polymarket] Could not match token for outcome "${name}" by name, tokens:`,
        tokens.map(t => ({ outcome: t.outcome, tokenId: t.tokenId?.slice(0, 10) + '...' })));
    }

    // Only use index fallback for non-binary outcomes (multi-choice markets)
    if (!isBinaryOutcome && tokens[idx]?.tokenId) return tokens[idx].tokenId;

    // Last resort: single token
    if (tokens.length === 1) return tokens[0]?.tokenId;

    return undefined;
  };

  const approveAllOutcomes = async (item: IntakeItem) => {
    try {
      setLoading(true);
      setLoadingId(item.polymarketId);
      const internalEventId = item.internalEventId || makeRandomInternalId();
      const outcomeMapping =
        item.outcomes?.map((o, idx) => {
          const tokenId = resolveTokenForOutcome(item, idx, o.name);
          return {
            internalOutcomeId: `${internalEventId}-${idx}`,
            polymarketTokenId: tokenId,
            name: o.name || `Outcome ${idx + 1}`,
            probability: typeof o.probability === 'number' ? o.probability : o.price,
          };
        }) || [];

      const eventData = {
        title: item.title || item.question,
        description: item.description || '',
        categories: item.categories || [],
        image: item.image,
        resolutionDate: item.endDate,
        startDate: item.startDate,
        createdAt: item.createdAt,
        resolutionSource: item.resolutionSource,
        volume: item.volume,
        betCount: item.volume24hr, // fallback
      };

      const legacyTokenId =
        resolveTokenForOutcome(item, 0, item.outcomes?.[0]?.name) ||
        item.tokens[0]?.tokenId ||
        item.polymarketId;

      const payload = {
        polymarketId: item.polymarketId,
        polymarketConditionId: item.conditionId,
        polymarketTokenId: legacyTokenId, // legacy field
        internalEventId,
        outcomeMapping,
        eventData,
        notes: '',
        // Pass event type classification (respecting manual overrides)
        isGroupedBinary: (forcedTypes[item.polymarketId] || item.marketType) === 'GROUPED_BINARY',
        marketType: forcedTypes[item.polymarketId] || item.marketType || 'BINARY',
      };

      const res = await fetch('/api/polymarket/intake/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Approve failed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
  };

  const openReject = (item: IntakeItem) => {
    setForm({ internalEventId: '', tokenId: '', notes: '' });
    setModal({ type: 'reject', item });
  };

  const submitApprove = async () => {
    if (!modal || modal.type !== 'approve') return;
    try {
      setLoading(true);
      const payload = {
        polymarketId: modal.item.polymarketId,
        polymarketConditionId: modal.item.conditionId,
        polymarketTokenId: form.tokenId,
        internalEventId: form.internalEventId,
        notes: form.notes || undefined,
        // Pass event type classification (respecting manual overrides)
        isGroupedBinary: (forcedTypes[modal.item.polymarketId] || modal.item.marketType) === 'GROUPED_BINARY',
        marketType: forcedTypes[modal.item.polymarketId] || modal.item.marketType || 'BINARY',
      };
      const res = await fetch('/api/polymarket/intake/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Approve failed');
      await load();
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setLoading(false);
    }
  };

  const submitReject = async () => {
    if (!modal || modal.type !== 'reject') return;
    try {
      setLoading(true);
      const payload = {
        polymarketId: modal.item.polymarketId,
        reason: form.notes || undefined,
      };
      const res = await fetch('/api/polymarket/intake/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Reject failed');
      await load();
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = [...items];

    // Filter by outcome count
    if (outcomeFilter !== 'all') {
      result = result.filter((item) => {
        const count = item.outcomes?.length || 0;
        if (outcomeFilter === '2') return count === 2;
        if (outcomeFilter === '3-5') return count >= 3 && count <= 5;
        if (outcomeFilter === '6+') return count >= 6;
        return true;
      });
    }

    // Status is now filtered server-side, but we keep this for sorting/consistency
    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'volume') {
        comparison = (b.volume || 0) - (a.volume || 0);
      } else if (sortBy === 'date') {
        comparison = new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime();
      } else if (sortBy === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      }

      return sortOrder === 'desc' ? comparison : -comparison;
    });

    return result;
  }, [items, sortBy, sortOrder, outcomeFilter]);

  const totalItems = filteredAndSorted.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSorted.slice(start, start + itemsPerPage);
  }, [filteredAndSorted, currentPage, itemsPerPage]);

  const filtered = filteredAndSorted; // keeping for backward compat if needed

  // Items that haven't been processed yet (for bulk selection)
  const selectableItems = useMemo(() => filteredAndSorted.filter(i => i.status !== 'approved' && i.status !== 'rejected'), [filteredAndSorted]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === selectableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map((i) => i.polymarketId)));
    }
  };

  const bulkApprove = async () => {
    const toApprove = selectableItems.filter((i) => selectedIds.has(i.polymarketId));
    if (toApprove.length === 0) return;

    setBulkApproving(true);
    setBulkProgress({ current: 0, total: toApprove.length });
    setError(null);

    let successCount = 0;
    for (let i = 0; i < toApprove.length; i++) {
      const item = toApprove[i];
      setBulkProgress({ current: i + 1, total: toApprove.length });
      setLoadingId(item.polymarketId);

      try {
        const internalEventId = item.internalEventId || makeRandomInternalId();
        const outcomeMapping =
          item.outcomes?.map((o, idx) => {
            const tokenId = resolveTokenForOutcome(item, idx, o.name);
            return {
              internalOutcomeId: `${internalEventId}-${idx}`,
              polymarketTokenId: tokenId,
              name: o.name || `Outcome ${idx + 1}`,
              probability: typeof o.probability === 'number' ? o.probability : o.price,
            };
          }) || [];

        const eventData = {
          title: item.title || item.question,
          description: item.description || '',
          categories: item.categories || [],
          image: item.image,
          resolutionDate: item.endDate,
          startDate: item.startDate,
          createdAt: item.createdAt,
          resolutionSource: item.resolutionSource,
          volume: item.volume,
          betCount: item.volume24hr,
        };

        const legacyTokenId =
          resolveTokenForOutcome(item, 0, item.outcomes?.[0]?.name) ||
          item.tokens[0]?.tokenId ||
          item.polymarketId;

        const payload = {
          polymarketId: item.polymarketId,
          polymarketConditionId: item.conditionId,
          polymarketTokenId: legacyTokenId,
          internalEventId,
          outcomeMapping,
          eventData,
          notes: '',
          isGroupedBinary: (forcedTypes[item.polymarketId] || item.marketType) === 'GROUPED_BINARY',
          marketType: forcedTypes[item.polymarketId] || item.marketType || 'BINARY',
        };

        const res = await fetch('/api/polymarket/intake/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          successCount++;
        } else {
          console.error(`[Bulk Approve] Failed for ${item.polymarketId}`);
        }
      } catch (err) {
        console.error(`[Bulk Approve] Error for ${item.polymarketId}:`, err);
      }
    }

    setLoadingId(null);
    setBulkApproving(false);
    setBulkProgress(null);
    setSelectedIds(new Set());

    // Reload to reflect changes
    await load();

    if (successCount < toApprove.length) {
      setError(`Bulk approve: ${successCount}/${toApprove.length} succeeded`);
    }
  };

  const formatProb = (p?: number) => {
    if (p == null || Number.isNaN(p) || p === undefined) return '—';
    // If p > 100, it's likely not a probability (e.g., price target like 120000)
    if (p > 100) return '—';
    // If p is already a percentage (0-100), convert to probability first, then back to percentage for display
    if (p > 1 && p <= 100) {
      const prob = Math.max(0, Math.min(1, p / 100));
      return `${(prob * 100).toFixed(1)}%`;
    }
    // Otherwise treat as probability (0-1) and convert to percentage
    const clamped = Math.max(0, Math.min(1, p));
    return `${(clamped * 100).toFixed(1)}%`;
  };

  const formatUsd = (v?: number) => {
    if (v == null || Number.isNaN(v)) return '—';
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}m`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
    return `$${v.toFixed(0)}`;
  };

  const formatChange = (v?: number) => {
    if (v == null || Number.isNaN(v)) return '—';
    const pct = (v * 100).toFixed(2);
    const sign = v > 0 ? '+' : '';
    return `${sign}${pct}%`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-200">Polymarket Intake</h2>
          <p className="text-sm text-muted-foreground">
            Gamma-backed view with richer context. Default shows top 400 by volume.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Polymarket..."
              className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-2 pl-10 text-zinc-200 placeholder-muted-foreground focus:outline-none focus:border-emerald-500/50 transition-colors text-sm"
            />
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={load}
            className="px-3 py-2 rounded-lg bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/5"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-4 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-2">Status</span>
            {(['all', 'unmapped', 'approved', 'rejected'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${statusFilter === s
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-zinc-200'
                  }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {s === 'all' && ` (${items.length})`}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-white/10" />

          {/* Outcome Count Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-2">Outcomes</span>
            {(['all', '2', '3-5', '6+'] as const).map((o) => (
              <button
                key={o}
                onClick={() => { setOutcomeFilter(o); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${outcomeFilter === o
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-zinc-200'
                  }`}
              >
                {o === 'all' ? 'All' : o === '2' ? '2 (Binary)' : o}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setCurrentPage(1); }}
              className="bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="volume">Volume</option>
              <option value="date">Date</option>
              <option value="title">Title</option>
            </select>
          </div>
          <button
            onClick={() => { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); setCurrentPage(1); }}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-1l4 4m0 0l4-4m-4 4V8" /></svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Bulk Approve Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-4 z-[60] left-[calc(var(--sidebar-width,256px)/2+50%)] -translate-x-1/2 w-[calc(100%-2rem)] md:w-[calc(100%-var(--sidebar-width,256px)-4rem)] flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-950/90 backdrop-blur-xl px-6 py-4 shadow-2xl shadow-black transition-all duration-300"
          >
            <span className="text-sm text-emerald-300 font-medium">
              {selectedIds.size} event{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            {bulkProgress && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-32 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-emerald-400">
                  {bulkProgress.current}/{bulkProgress.total}
                </span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={bulkApprove}
                disabled={bulkApproving || loading}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                {bulkApproving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Approving...
                  </>
                ) : (
                  <>🚀 Bulk Approve</>
                )}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkApproving}
                className="px-3 py-2 rounded-lg bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 border border-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-auto rounded-xl border border-white/5">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-zinc-300">
            <tr>
              <th className="px-3 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectableItems.length > 0 && selectedIds.size === selectableItems.length}
                  onChange={selectAll}
                  disabled={selectableItems.length === 0 || bulkApproving}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={selectableItems.length === 0 ? 'No pending items to select' : 'Select all pending'}
                />
              </th>
              <th className="px-4 py-3 text-left">Market</th>
              <th className="px-4 py-3 text-left">Categories</th>
              <th className="px-4 py-3 text-left">Outcomes & Prices</th>
              <th className="px-4 py-3 text-left">Volume</th>
              <th className="px-4 py-3 text-left">Change</th>
              <th className="px-4 py-3 text-left">End</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-background">
            {paginatedItems.map((item, idx) => (
              <tr key={item.polymarketId || `poly-${idx}`} className={selectedIds.has(item.polymarketId) ? 'bg-emerald-500/5' : ''}>
                <td
                  className="px-3 py-3 cursor-pointer"
                  onClick={() => {
                    if (item.status === 'approved' || item.status === 'rejected' || bulkApproving) return;
                    toggleSelect(item.polymarketId);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.polymarketId)}
                    onChange={(e) => {
                      // Stop bubbling so td.onClick doesn't fire as well
                      e.stopPropagation();
                      toggleSelect(item.polymarketId);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    disabled={item.status === 'approved' || item.status === 'rejected' || bulkApproving}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-4 py-3 text-zinc-200">
                  <div className="flex items-start gap-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-12 w-12 rounded-md object-cover border border-white/5" />
                    ) : (
                      <div className="h-12 w-12 rounded-md border border-white/5 bg-white/5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <a
                          href={item.polymarketSlug ? `https://polymarket.com/event/${item.polymarketSlug}` : '#'}
                          className="font-semibold leading-snug line-clamp-2 text-blue-300 hover:text-blue-200 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => !item.polymarketSlug && e.preventDefault()}
                        >
                          {item.title || item.question || 'Untitled market'} ↗
                        </a>
                        {/* Market Type Badge with Manual Override */}
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              // Only allow toggling for relevant types (not strict BINARY)
                              if (item.marketType === 'BINARY') return;
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === item.polymarketId ? null : item.polymarketId);
                            }}
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap cursor-pointer transition-opacity hover:opacity-80 ${(forcedTypes[item.polymarketId] || item.marketType) === 'GROUPED_BINARY'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : (forcedTypes[item.polymarketId] || item.marketType) === 'MULTIPLE'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                          >
                            {(forcedTypes[item.polymarketId] || item.marketType) === 'GROUPED_BINARY'
                              ? `🧩 Sub-Bets (${item.variantCount || 'N/A'})`
                              : (forcedTypes[item.polymarketId] || item.marketType) === 'MULTIPLE'
                                ? '📊 Multi'
                                : '✅ Binary'}
                            {item.marketType !== 'BINARY' && <span className="ml-1 text-[8px] opacity-70">▼</span>}
                          </button>

                          {/* Dropdown Menu */}
                          {openDropdownId === item.polymarketId && (
                            <div className="absolute top-full left-0 mt-1 w-40 rounded-md border border-white/5 bg-surface-elevated shadow-xl z-50 overflow-hidden">
                              <button
                                onClick={() => {
                                  setForcedTypes((prev) => ({ ...prev, [item.polymarketId]: 'MULTIPLE' }));
                                  setOpenDropdownId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 flex items-center gap-2"
                              >
                                <span className="text-blue-400">📊</span> Multi (Exclusive)
                              </button>
                              <button
                                onClick={() => {
                                  setForcedTypes((prev) => ({ ...prev, [item.polymarketId]: 'GROUPED_BINARY' }));
                                  setOpenDropdownId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 flex items-center gap-2"
                              >
                                <span className="text-purple-400">🧩</span> Sub-Bets (Indep.)
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {item.question || item.description || 'No question provided'}
                      </div>
                      <div className="text-[11px] text-zinc-500 flex gap-2 flex-wrap">
                        <span>Orderbook: {item.enableOrderBook ? 'Yes' : 'No'}</span>
                        <span>Active: {item.acceptingOrders ? 'Yes' : 'No'}</span>
                        {item.isGroupedBinary && (
                          <span className="text-purple-400">⚠️ Each outcome = separate binary market</span>
                        )}
                        {item.resolutionSource && (
                          <a
                            href={item.resolutionSource}
                            className="text-blue-300 hover:text-blue-200 underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Rules
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-200">
                  <div className="flex flex-wrap gap-1">
                    {(item.categories || []).slice(0, 4).map((c) => (
                      <span
                        key={`${item.polymarketId}-${c}`}
                        className="px-2 py-1 rounded-full bg-white/5 text-xs text-zinc-200"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-200">
                  <div className="flex flex-wrap gap-2">
                    {(item.outcomes || []).slice(0, 4).map((o, i) => (
                      <div
                        key={o.id || `${item.polymarketId}-o-${i}`}
                        className="rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-xs"
                      >
                        <div className="text-zinc-200">{o.name}</div>
                        <div className="text-zinc-300">{formatProb(o.probability ?? o.price)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    Bid {item.bestBid?.toFixed(2) ?? '—'} · Ask {item.bestAsk?.toFixed(2) ?? '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-200">
                  <div className="text-sm text-zinc-200">{formatUsd(item.volume)}</div>
                  <div className="text-[11px] text-zinc-500">24h {formatUsd(item.volume24hr)}</div>
                </td>
                <td className="px-4 py-3 text-zinc-200">
                  <div className="text-sm">{formatChange(item.oneDayPriceChange)}</div>
                  <div className="text-[11px] text-zinc-500">1h {formatChange(item.oneHourPriceChange)}</div>
                </td>
                <td className="px-4 py-3 text-zinc-200">{formatDate(item.endDate)}</td>
                <td className="px-4 py-3">
                  {loadingId === item.polymarketId ? (
                    <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                      <span className="text-[10px] font-medium text-emerald-400">Processing...</span>
                    </div>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${item.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : item.status === 'rejected'
                          ? 'bg-red-500/10 text-red-300'
                          : 'bg-white/5 text-zinc-200'
                        }`}
                    >
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  )}
                  {item.internalEventId && (
                    <div className="text-[11px] text-muted-foreground mt-1 break-words">{item.internalEventId}</div>
                  )}
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">{item.polymarketId}</div>
                  {item.variantCount && item.variantCount > 1 && (
                    <div className="text-[11px] text-zinc-500 mt-1">{item.variantCount} variants</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
                      onClick={() => approveAllOutcomes(item)}
                      disabled={loading}
                    >
                      Approve
                    </button>
                    <button
                      className="px-3 py-1 rounded-lg bg-red-500/20 text-red-100 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50"
                      onClick={() => openReject(item)}
                      disabled={loading}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginatedItems.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                  No markets found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
      />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-lg rounded-xl border border-white/5 bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-200">Reject market</h3>
              <button
                className="text-muted-foreground hover:text-white"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {modal.type === 'reject' && (
              <div className="space-y-3">
                <label className="block text-sm text-zinc-300">
                  Reason (optional)
                  <textarea
                    className="mt-1 w-full rounded-md bg-white/5 border border-white/5 px-3 py-2 text-zinc-200 text-sm"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-white/5 text-zinc-200 border border-white/5"
                    onClick={() => setModal(null)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                    onClick={submitReject}
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

