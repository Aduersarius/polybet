'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowDownCircle,
    ArrowUpCircle,
    RefreshCw,
    ShieldCheck,
    Wallet
} from 'lucide-react';

type TransactionType = 'DEPOSIT' | 'WITHDRAWAL';

interface Transaction {
    id: string;
    type: TransactionType;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    txHash?: string | null;
    fromAddress?: string | null;
    toAddress?: string | null;
    user: {
        id: string;
        username: string | null;
        email: string | null;
    };
}

interface HedgeRecord {
    id: string;
    userId: string;
    username: string | null;
    eventId: string;
    eventTitle: string;
    amount: number;
    side: string;
    price: number;
    option: string;
    createdAt: string;
    status: string;
    hedge: {
        status: string;
        price: number;
        spread: number;
        netProfit: number;
        failureReason?: string;
        polymarketOrderId?: string;
        hedgedAt?: string;
    } | null;
    poly: {
        status: string;
        amountFilled: number;
        error?: string;
    } | null;
}

interface FinanceStats {
    totalDeposits: number;
    totalWithdrawals: number;
    netFlow: number;
    depositCount: number;
    withdrawalCount: number;
    pendingWithdrawalAmount: number;
    pendingWithdrawalCount: number;
    platformBalance: number;
    lockedBalance: number;
    availableBalance: number;
    ledgerEntries: number;
}

interface FinanceResponse {
    stats: FinanceStats;
    transactions: Transaction[];
    hasMore?: boolean;
    nextCursor?: string | null;
}

const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (date: string) =>
    new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/30',
    APPROVED: 'bg-blue-500/10 text-blue-300 border border-blue-500/30',
    COMPLETED: 'bg-green-500/10 text-green-300 border border-green-500/30',
    REJECTED: 'bg-red-500/10 text-red-300 border border-red-500/30',
    FAILED: 'bg-red-500/10 text-red-300 border border-red-500/30',
};

export function AdminFinance() {
    const [stats, setStats] = useState<FinanceStats | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingStats, setLoadingStats] = useState(true);
    const [loadingTx, setLoadingTx] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'TRANSACTIONS' | 'HEDGES'>('TRANSACTIONS');
    const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');

    const [hedges, setHedges] = useState<HedgeRecord[]>([]);
    const [hedgeCursor, setHedgeCursor] = useState<string | null>(null);
    const [hedgeHasMore, setHedgeHasMore] = useState(false);
    const [loadingHedges, setLoadingHedges] = useState(false);

    const fetchStats = async () => {
        try {
            setError(null);
            setLoadingStats(true);
            const res = await fetch('/api/admin/finance?mode=stats');
            if (!res.ok) throw new Error('Failed to load finance stats');
            const json = await res.json();
            setStats(json.stats);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load finance stats');
        } finally {
            setLoadingStats(false);
        }
    };

    const fetchTransactions = async (opts?: { append?: boolean; before?: string | null }) => {
        const append = opts?.append ?? false;
        const cursor = opts?.before;
        try {
            setError(null);
            setLoadingTx(true);
            const url = new URL('/api/admin/finance', window.location.origin);
            if (cursor) url.searchParams.set('before', cursor);
            const res = await fetch(url.toString());
            if (!res.ok) throw new Error('Failed to load finance transactions');
            const json: FinanceResponse = await res.json();
            setTransactions((prev) => (append ? [...prev, ...json.transactions] : json.transactions));
            setNextCursor(json.nextCursor ?? null);
            setHasMore(Boolean(json.hasMore));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load finance transactions');
        } finally {
            setLoadingTx(false);
        }
    };

    const fetchHedges = async (opts?: { append?: boolean; before?: string | null }) => {
        const append = opts?.append ?? false;
        const cursor = opts?.before;
        try {
            setError(null);
            setLoadingHedges(true);
            const url = new URL('/api/admin/finance/hedges', window.location.origin);
            if (cursor) url.searchParams.set('before', cursor);
            const res = await fetch(url.toString());
            if (!res.ok) throw new Error('Failed to load hedge history');
            const json = await res.json();
            setHedges((prev) => (append ? [...prev, ...json.hedges] : json.hedges));
            setHedgeCursor(json.nextCursor ?? null);
            setHedgeHasMore(Boolean(json.hasMore));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load hedge history');
        } finally {
            setLoadingHedges(false);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchTransactions();
        fetchHedges();
    }, []);

    const filteredTransactions = useMemo(() => {
        if (!transactions) return [];
        if (typeFilter === 'ALL') return transactions;
        return transactions.filter((tx) => tx.type === typeFilter);
    }, [transactions, typeFilter]);

    const onRefresh = () => {
        setTransactions([]);
        setNextCursor(null);
        setHasMore(false);
        setHedges([]);
        setHedgeCursor(null);
        setHedgeHasMore(false);
        fetchStats();
        fetchTransactions();
        fetchHedges();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-200">Money & Flows</h2>
                    <p className="text-sm text-muted-foreground">
                        Platform-level deposits, withdrawals, balances, and ledger activity.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <a
                        href="/admin/withdrawals"
                        className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                        Review withdrawals
                    </a>
                    <a
                        href="/admin/withdraw"
                        className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                        New withdrawal
                    </a>
                    <button
                        onClick={onRefresh}
                        className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {loadingStats ? (
                    <div className="col-span-full flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-surface p-6 text-muted-foreground">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Loading finance stats...
                    </div>
                ) : error ? (
                    <div className="col-span-full rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
                        {error}
                    </div>
                ) : stats ? (
                    [
                        {
                            label: 'Total Deposits',
                            value: formatCurrency(stats.totalDeposits),
                            sub: `${stats.depositCount.toLocaleString()} deposits`,
                            icon: <ArrowDownCircle className="h-5 w-5 text-emerald-300" />,
                        },
                        {
                            label: 'Total Withdrawals',
                            value: formatCurrency(stats.totalWithdrawals),
                            sub: `${stats.withdrawalCount.toLocaleString()} withdrawals`,
                            icon: <ArrowUpCircle className="h-5 w-5 text-orange-300" />,
                        },
                        {
                            label: 'Net Flow',
                            value: formatCurrency(stats.netFlow),
                            sub: stats.netFlow >= 0 ? 'Inflow positive' : 'Outflow exceeds inflow',
                            icon: <Activity className="h-5 w-5 text-blue-300" />,
                        },
                        {
                            label: 'Pending Withdrawals',
                            value: formatCurrency(stats.pendingWithdrawalAmount),
                            sub: `${stats.pendingWithdrawalCount} pending`,
                            icon: <AlertTriangle className="h-5 w-5 text-yellow-300" />,
                        },
                        {
                            label: 'Platform Balance',
                            value: formatCurrency(stats.platformBalance),
                            sub: 'Base token (TUSD) balance',
                            icon: <Wallet className="h-5 w-5 text-cyan-300" />,
                        },
                        {
                            label: 'Locked Funds',
                            value: formatCurrency(stats.lockedBalance),
                            sub: 'Held for withdrawals / bets',
                            icon: <ShieldCheck className="h-5 w-5 text-purple-300" />,
                        },
                        {
                            label: 'Available Balance',
                            value: formatCurrency(stats.availableBalance),
                            sub: 'Platform available liquidity',
                            icon: <Wallet className="h-5 w-5 text-emerald-300" />,
                        },
                        {
                            label: 'Ledger Entries',
                            value: stats.ledgerEntries.toLocaleString(),
                            sub: 'Historical money movements',
                            icon: <Activity className="h-5 w-5 text-indigo-300" />,
                        },
                    ].map((card) => (
                        <div
                            key={card.label}
                            className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">{card.label}</p>
                                    <p className="mt-2 text-2xl font-bold text-zinc-200">{card.value}</p>
                                    <p className="text-xs text-zinc-500">{card.sub}</p>
                                </div>
                                <div className="rounded-lg bg-white/5 p-2">{card.icon}</div>
                            </div>
                        </div>
                    ))
                ) : null}
            </div>

            {/* Transactions */}
            <div className="rounded-xl border border-white/5 bg-surface shadow-lg shadow-black/30">
                <div className="flex flex-col gap-3 border-b border-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-zinc-200">
                            {viewMode === 'TRANSACTIONS' ? 'Transactions' : 'Hedge History'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {viewMode === 'TRANSACTIONS'
                                ? 'Recent deposits and withdrawals across the platform.'
                                : 'Automated hedging activity on Polymarket.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex bg-black/20 p-1 rounded-lg mr-2">
                            <button
                                onClick={() => setViewMode('TRANSACTIONS')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'TRANSACTIONS' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                            >
                                Transactions
                            </button>
                            <button
                                onClick={() => setViewMode('HEDGES')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'HEDGES' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                            >
                                Hedges
                            </button>
                        </div>

                        {viewMode === 'TRANSACTIONS' && (['ALL', 'DEPOSIT', 'WITHDRAWAL'] as const).map((option) => (
                            <button
                                key={option}
                                onClick={() => setTypeFilter(option)}
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${typeFilter === option
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                                    }`}
                            >
                                {option === 'ALL' ? 'All' : option === 'DEPOSIT' ? 'Deposits' : 'Withdrawals'}
                            </button>
                        ))}
                    </div>
                </div>

                {viewMode === 'HEDGES' ? (
                    <>
                        {loadingHedges && hedges.length === 0 ? (
                            <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                Loading hedges...
                            </div>
                        ) : error ? (
                            <div className="p-6 text-sm text-red-300">{error}</div>
                        ) : hedges.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No hedge records found.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 text-left text-xs uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-5 py-3 font-medium">User</th>
                                            <th className="px-5 py-3 font-medium">Event / Outcome</th>
                                            <th className="px-5 py-3 font-medium text-right">Stake ($)</th>
                                            <th className="px-5 py-3 font-medium text-right">User Price</th>
                                            <th className="px-5 py-3 font-medium">Hedge Status</th>
                                            <th className="px-5 py-3 font-medium text-right">Hedge Price</th>
                                            <th className="px-5 py-3 font-medium text-right">P/L (Spread)</th>
                                            <th className="px-5 py-3 font-medium">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {hedges.map((h) => (
                                            <tr key={h.id} className="hover:bg-white/5">
                                                <td className="px-5 py-3">
                                                    <div className="text-zinc-200 text-xs font-medium">{h.username || 'Unknown'}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[100px]">{h.userId}</div>
                                                </td>
                                                <td className="px-5 py-3 max-w-[250px]">
                                                    <div className="text-zinc-200 text-xs truncate" title={h.eventTitle}>{h.eventTitle}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${h.option === 'YES' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {h.option}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500">{h.side}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-right text-zinc-200 font-mono">
                                                    {formatCurrency(h.amount)}
                                                </td>
                                                <td className="px-5 py-3 text-right text-zinc-300 font-mono">
                                                    {h.price.toFixed(3)}
                                                </td>
                                                <td className="px-5 py-3">
                                                    {h.hedge ? (
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${h.hedge.status === 'hedged' ? 'bg-blue-500/10 text-blue-400' :
                                                            h.hedge.status === 'retry' ? 'bg-yellow-500/10 text-yellow-400' :
                                                                'bg-red-500/10 text-red-400'
                                                            }`}>
                                                            {h.hedge.status === 'hedged' && <ShieldCheck className="w-3 h-3" />}
                                                            {h.hedge.status}
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-500 text-xs italic">Unhedged</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    {h.hedge ? (
                                                        <span className="text-zinc-200 font-mono">{h.hedge.price.toFixed(3)}</span>
                                                    ) : (
                                                        <span className="text-zinc-600">-</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    {h.hedge ? (
                                                        <div className={`font-mono text-xs ${h.hedge.spread >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {h.hedge.spread >= 0 ? '+' : ''}{h.hedge.spread.toFixed(3)}
                                                        </div>
                                                    ) : (
                                                        <span className="text-zinc-600">-</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">
                                                    {formatDate(h.createdAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!loadingHedges && !error && hedgeHasMore && (
                            <div className="border-t border-white/5 p-4 text-center">
                                <button
                                    onClick={() => fetchHedges({ append: true, before: hedgeCursor })}
                                    className="inline-flex items-center justify-center rounded-md bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
                                >
                                    Load more hedges
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {loadingTx ? (
                            <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                Loading transactions...
                            </div>
                        ) : error ? (
                            <div className="p-6 text-sm text-red-300">{error}</div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No transactions found.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 text-left text-xs uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-5 py-3 font-medium">Type</th>
                                            <th className="px-5 py-3 font-medium">User</th>
                                            <th className="px-5 py-3 font-medium">Amount</th>
                                            <th className="px-5 py-3 font-medium">Token</th>
                                            <th className="px-5 py-3 font-medium">Status</th>
                                            <th className="px-5 py-3 font-medium">Hash / Address</th>
                                            <th className="px-5 py-3 font-medium">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filteredTransactions.map((tx) => (
                                            <tr key={tx.id} className="hover:bg-white/5">
                                                <td className="px-5 py-3">
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tx.type === 'DEPOSIT'
                                                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                                            : 'bg-orange-500/10 text-orange-300 border border-orange-500/20'
                                                            }`}
                                                    >
                                                        {tx.type === 'DEPOSIT' ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                                                        {tx.type}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="text-zinc-200">
                                                        {tx.user.username || tx.user.email || 'Unknown'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{tx.user.email}</div>
                                                </td>
                                                <td className="px-5 py-3 font-semibold text-zinc-200">
                                                    {formatCurrency(tx.amount)}
                                                </td>
                                                <td className="px-5 py-3 text-zinc-300">{tx.currency}</td>
                                                <td className="px-5 py-3">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${statusColors[tx.status?.toUpperCase()] || 'bg-white/5 text-zinc-300 border border-white/5'
                                                            }`}
                                                    >
                                                        {tx.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="text-xs font-mono text-zinc-300 max-w-[220px] truncate">
                                                        {tx.txHash || tx.toAddress || tx.fromAddress || '—'}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-zinc-300">{formatDate(tx.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!loadingTx && !error && hasMore && (
                            <div className="border-t border-white/5 p-4 text-center">
                                <button
                                    onClick={() => fetchTransactions({ append: true, before: nextCursor })}
                                    className="inline-flex items-center justify-center rounded-md bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
                                >
                                    Load more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
