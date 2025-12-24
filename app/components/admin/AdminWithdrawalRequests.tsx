'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock, Wallet, TrendingUp } from 'lucide-react';

interface Withdrawal {
    id: string;
    amount: number;
    currency: string;
    toAddress: string;
    status: string;
    createdAt: string;
    user: {
        id: string;
        username: string | null;
        email: string | null;
    };
}

type BalanceResponse = {
    balance: number;
    balances: Array<{ tokenSymbol: string; eventId: string | null; outcomeId: string | null; amount: number }>;
};

export function AdminWithdrawalRequests() {
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
    const [loading, setLoading] = useState(true);
    const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null);
    const [loadingBalance, setLoadingBalance] = useState(true);

    useEffect(() => {
        fetchWithdrawals();
        fetchBalance();
    }, []);

    const fetchBalance = async () => {
        try {
            const res = await fetch('/api/balance');
            const data: BalanceResponse = await res.json();
            setBalanceData(data);
        } catch (error) {
            console.error('Failed to fetch balance', error);
        } finally {
            setLoadingBalance(false);
        }
    };

    const fetchWithdrawals = async () => {
        try {
            const res = await fetch('/api/admin/withdrawals');
            const data = await res.json();
            setWithdrawals(data);
        } catch (error) {
            console.error('Failed to fetch withdrawals', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (withdrawalId: string, action: 'APPROVE' | 'REJECT') => {
        try {
            const res = await fetch('/api/admin/withdrawals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ withdrawalId, action }),
            });

            if (res.ok) {
                fetchWithdrawals();
            } else {
                alert('Action failed');
            }
        } catch (error) {
            console.error('Action error', error);
        }
    };

    const stats = {
        pending: withdrawals.filter(w => w.status === 'PENDING').length,
        totalAmount: withdrawals
            .filter(w => w.status === 'PENDING')
            .reduce((sum, w) => sum + Number(w.amount ?? 0), 0),
    };

    const availableTusd = useMemo(() => {
        if (!balanceData) return 0;
        const tusd = balanceData.balances.find(
            (b) => b.tokenSymbol === 'TUSD' && !b.eventId && !b.outcomeId
        );
        return Number(tusd?.amount ?? balanceData.balance ?? 0);
    }, [balanceData]);

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-4">
                <div className="rounded-xl border border-white/5 bg-surface p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Available (TUSD)</p>
                            <p className="mt-2 text-3xl font-bold text-zinc-200">
                                {loadingBalance ? '—' : `$${availableTusd.toFixed(2)}`}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg bg-primary/10">
                            <Wallet className="w-6 h-6 text-primary" />
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-surface p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Pending Requests</p>
                            <p className="mt-2 text-3xl font-bold text-zinc-200">{stats.pending}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-yellow-500/10">
                            <Clock className="w-6 h-6 text-yellow-400" />
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-surface p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Amount Pending</p>
                            <p className="mt-2 text-3xl font-bold text-zinc-200">${stats.totalAmount.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-primary/10">
                            <Wallet className="w-6 h-6 text-primary" />
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-surface p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Processed</p>
                            <p className="mt-2 text-3xl font-bold text-zinc-200">{withdrawals.length - stats.pending}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-emerald-500/10">
                            <TrendingUp className="w-6 h-6 text-emerald-400" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Withdrawals Table */}
            <div className="overflow-hidden rounded-xl border border-white/5 bg-surface backdrop-blur-sm">
                <div className="p-6 border-b border-white/5">
                    <h2 className="text-lg font-semibold text-zinc-200">Withdrawal Requests</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white/5 text-xs uppercase text-muted-foreground border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4 font-medium">User</th>
                                <th className="px-6 py-4 font-medium">Amount</th>
                                <th className="px-6 py-4 font-medium">Destination</th>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                                            Loading...
                                        </div>
                                    </td>
                                </tr>
                            ) : withdrawals.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                        No withdrawal requests found
                                    </td>
                                </tr>
                            ) : (
                                withdrawals.map((w) => (
                                    <tr key={w.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-zinc-200">{w.user.username || 'Unknown'}</div>
                                            <div className="text-xs text-muted-foreground">{w.user.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-zinc-200">${Number(w.amount ?? 0).toFixed(2)}</div>
                                            <div className="text-xs text-muted-foreground">{w.currency}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-mono text-xs text-zinc-300 max-w-[200px] truncate">
                                                {w.toAddress}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">
                                            {new Date(w.createdAt).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${w.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                                w.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                    'bg-red-500/10 text-red-400 border border-red-500/20'
                                                }`}>
                                                {w.status === 'PENDING' && <Clock className="w-3 h-3" />}
                                                {w.status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3" />}
                                                {w.status === 'REJECTED' && <XCircle className="w-3 h-3" />}
                                                {w.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {w.status === 'PENDING' ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleAction(w.id, 'APPROVE')}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
                                                    >
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(w.id, 'REJECT')}
                                                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
                                                    >
                                                        <XCircle className="w-3 h-3" />
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-zinc-500">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
