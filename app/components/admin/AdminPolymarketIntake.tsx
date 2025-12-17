'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type IntakeItem = {
  polymarketId: string;
  polymarketEventId?: string;
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

  const makeRandomInternalId = () => {
    // 9-digit random integer as string
    return String(Math.floor(100_000_000 + Math.random() * 900_000_000));
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/polymarket/intake');
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
  }, []);

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
      return () => {};
    }
  }, []);

  const approveAllOutcomes = async (item: IntakeItem) => {
    try {
      setLoading(true);
      const internalEventId = item.internalEventId || makeRandomInternalId();
      const outcomeMapping =
        item.outcomes?.map((o, idx) => ({
          internalOutcomeId: `${internalEventId}-${idx}`,
          polymarketTokenId: item.tokens[idx]?.tokenId || item.tokens[0]?.tokenId,
          name: o.name || `Outcome ${idx + 1}`,
          probability: typeof o.probability === 'number' ? o.probability : o.price,
        })) || [];

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

      const payload = {
        polymarketId: item.polymarketId,
        polymarketConditionId: item.conditionId,
        polymarketTokenId: item.tokens[0]?.tokenId || item.polymarketId, // legacy field
        internalEventId,
        outcomeMapping,
        eventData,
        notes: '',
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

  const filtered = useMemo(() => items, [items]);

  const formatProb = (p?: number) => {
    if (p == null || Number.isNaN(p)) return '—';
    return `${(p * 100).toFixed(1)}%`;
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
          <h2 className="text-2xl font-semibold text-white">Polymarket Intake</h2>
          <p className="text-sm text-gray-400">
            Gamma-backed view with richer context: title, image, rules, prices, volume, and history.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/10"
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-gray-300">
            <tr>
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
          <tbody className="divide-y divide-white/5 bg-[#0f0f12]">
            {filtered.map((item, idx) => (
              <tr key={item.polymarketId || `poly-${idx}`}>
                <td className="px-4 py-3 text-white">
                  <div className="flex items-start gap-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-12 w-12 rounded-md object-cover border border-white/10" />
                    ) : (
                      <div className="h-12 w-12 rounded-md border border-white/10 bg-white/5" />
                    )}
                    <div className="space-y-1">
                      <div className="font-semibold leading-snug line-clamp-2">
                        {item.title || item.question || 'Untitled market'}
                      </div>
                      <div className="text-xs text-gray-400 line-clamp-2">
                        {item.question || item.description || 'No question provided'}
                      </div>
                      <div className="text-[11px] text-gray-500 flex gap-2 flex-wrap">
                        <span>Orderbook: {item.enableOrderBook ? 'Yes' : 'No'}</span>
                        <span>Active: {item.acceptingOrders ? 'Yes' : 'No'}</span>
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
                <td className="px-4 py-3 text-gray-200">
                  <div className="flex flex-wrap gap-1">
                    {(item.categories || []).slice(0, 4).map((c) => (
                      <span
                        key={`${item.polymarketId}-${c}`}
                        className="px-2 py-1 rounded-full bg-white/10 text-xs text-gray-200"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-200">
                  <div className="flex flex-wrap gap-2">
                    {(item.outcomes || []).slice(0, 4).map((o, i) => (
                      <div
                        key={o.id || `${item.polymarketId}-o-${i}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs"
                      >
                        <div className="text-white">{o.name}</div>
                        <div className="text-gray-300">{formatProb(o.probability ?? o.price)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Bid {item.bestBid?.toFixed(2) ?? '—'} · Ask {item.bestAsk?.toFixed(2) ?? '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-200">
                  <div className="text-sm text-white">{formatUsd(item.volume)}</div>
                  <div className="text-[11px] text-gray-500">24h {formatUsd(item.volume24hr)}</div>
                </td>
                <td className="px-4 py-3 text-gray-200">
                  <div className="text-sm">{formatChange(item.oneDayPriceChange)}</div>
                  <div className="text-[11px] text-gray-500">1h {formatChange(item.oneHourPriceChange)}</div>
                </td>
                <td className="px-4 py-3 text-gray-200">{formatDate(item.endDate)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                      item.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : item.status === 'rejected'
                        ? 'bg-red-500/10 text-red-300'
                        : 'bg-white/10 text-gray-200'
                    }`}
                  >
                    {item.status}
                  </span>
                  {item.internalEventId && (
                    <div className="text-[11px] text-gray-400 mt-1 break-words">{item.internalEventId}</div>
                  )}
                  <div className="text-[11px] text-gray-500 font-mono mt-1">{item.polymarketId}</div>
                  {item.variantCount && item.variantCount > 1 && (
                    <div className="text-[11px] text-gray-500 mt-1">{item.variantCount} variants</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
                      onClick={() => approveAllOutcomes(item)}
                      disabled={loading}
                    >
                      Auto-map
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
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  No markets available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#111113] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Reject market</h3>
              <button
                className="text-gray-400 hover:text-white"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {modal.type === 'reject' && (
              <div className="space-y-3">
                <label className="block text-sm text-gray-300">
                  Reason (optional)
                  <textarea
                    className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white text-sm"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20"
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

