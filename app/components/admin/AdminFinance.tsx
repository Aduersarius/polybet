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
    const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');

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

    useEffect(() => {
        fetchStats();
        fetchTransactions();
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
        fetchStats();
        fetchTransactions();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Money & Flows</h2>
                    <p className="text-sm text-gray-400">
                        Platform-level deposits, withdrawals, balances, and ledger activity.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <a
                        href="/admin/withdrawals"
                        className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
                    >
                        Review withdrawals
                    </a>
                    <a
                        href="/admin/withdraw"
                        className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
                    >
                        New withdrawal
                    </a>
                    <button
                        onClick={onRefresh}
                        className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {loadingStats ? (
                    <div className="col-span-full flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#161616] p-6 text-gray-400">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
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
                            className="rounded-xl border border-white/10 bg-[#161616] p-5 shadow-lg shadow-black/30"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">{card.label}</p>
                                    <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
                                    <p className="text-xs text-gray-500">{card.sub}</p>
                                </div>
                                <div className="rounded-lg bg-white/5 p-2">{card.icon}</div>
                            </div>
                        </div>
                    ))
                ) : null}
            </div>

            {/* Transactions */}
            <div className="rounded-xl border border-white/10 bg-[#161616] shadow-lg shadow-black/30">
                <div className="flex flex-col gap-3 border-b border-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Transactions</h3>
                        <p className="text-xs text-gray-400">Recent deposits and withdrawals across the platform.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {(['ALL', 'DEPOSIT', 'WITHDRAWAL'] as const).map((option) => (
                            <button
                                key={option}
                                onClick={() => setTypeFilter(option)}
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${typeFilter === option
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                    }`}
                            >
                                {option === 'ALL' ? 'All' : option === 'DEPOSIT' ? 'Deposits' : 'Withdrawals'}
                            </button>
                        ))}
                    </div>
                </div>

                {loadingTx ? (
                    <div className="flex items-center justify-center gap-2 p-6 text-gray-400">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        Loading transactions...
                    </div>
                ) : error ? (
                    <div className="p-6 text-sm text-red-300">{error}</div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="p-6 text-sm text-gray-400">No transactions found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/5 text-left text-xs uppercase text-gray-400">
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
                                            <div className="text-white">
                                                {tx.user.username || tx.user.email || 'Unknown'}
                                            </div>
                                            <div className="text-xs text-gray-400">{tx.user.email}</div>
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-white">
                                            {formatCurrency(tx.amount)}
                                        </td>
                                        <td className="px-5 py-3 text-gray-300">{tx.currency}</td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${statusColors[tx.status?.toUpperCase()] || 'bg-white/5 text-gray-300 border border-white/10'
                                                    }`}
                                            >
                                                {tx.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="text-xs font-mono text-gray-300 max-w-[220px] truncate">
                                                {tx.txHash || tx.toAddress || tx.fromAddress || '—'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-gray-300">{formatDate(tx.createdAt)}</td>
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
                            className="inline-flex items-center justify-center rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                        >
                            Load more
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
