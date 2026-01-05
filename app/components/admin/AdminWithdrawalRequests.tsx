'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock, Wallet, TrendingUp, Shield, X } from 'lucide-react';

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

    // TOTP Modal state
    const [totpModalOpen, setTotpModalOpen] = useState(false);
    const [pendingWithdrawalId, setPendingWithdrawalId] = useState<string | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [totpError, setTotpError] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchWithdrawals();
        fetchBalance();
    }, []);

    const fetchBalance = async () => {
        try {
            const res = await fetch('/api/balance', {
                credentials: 'include',
            });
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
            const res = await fetch('/api/admin/withdrawals', {
                credentials: 'include',
            });
            const data = await res.json();
            setWithdrawals(data);
        } catch (error) {
            console.error('Failed to fetch withdrawals', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApproveClick = (withdrawalId: string) => {
        setPendingWithdrawalId(withdrawalId);
        setTotpCode('');
        setTotpError('');
        setTotpModalOpen(true);
    };

    const handleApproveSubmit = async () => {
        if (!pendingWithdrawalId || !totpCode) return;

        setProcessing(true);
        setTotpError('');

        try {
            const res = await fetch('/api/admin/withdrawals', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    withdrawalId: pendingWithdrawalId,
                    action: 'APPROVE',
                    totpCode: totpCode.replace(/\s/g, '').trim()
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setTotpModalOpen(false);
                setPendingWithdrawalId(null);
                setTotpCode('');
                fetchWithdrawals();
            } else {
                setTotpError(data.error || 'Approval failed');
            }
        } catch (error) {
            console.error('Approval error', error);
            setTotpError('Network error. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (withdrawalId: string) => {
        if (!confirm('Are you sure you want to reject this withdrawal? The funds will be returned to the user.')) {
            return;
        }

        try {
            const res = await fetch('/api/admin/withdrawals', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ withdrawalId, action: 'REJECT' }),
            });

            if (res.ok) {
                fetchWithdrawals();
            } else {
                const data = await res.json();
                alert(data.error || 'Rejection failed');
            }
        } catch (error) {
            console.error('Reject error', error);
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
                                                        onClick={() => handleApproveClick(w.id)}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
                                                    >
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(w.id)}
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

            {/* TOTP Verification Modal */}
            {totpModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative w-full max-w-md mx-4 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10">
                                    <Shield className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-zinc-100">2FA Verification</h3>
                                    <p className="text-sm text-zinc-400">Enter your authenticator code</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setTotpModalOpen(false);
                                    setPendingWithdrawalId(null);
                                    setTotpCode('');
                                    setTotpError('');
                                }}
                                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <X className="w-5 h-5 text-zinc-400" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-zinc-400">
                                To approve this withdrawal, please enter the 6-digit code from your authenticator app.
                            </p>

                            <input
                                type="text"
                                value={totpCode}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                                    setTotpCode(value);
                                    setTotpError('');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && totpCode.length === 6) {
                                        handleApproveSubmit();
                                    }
                                }}
                                placeholder="000000"
                                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] bg-zinc-800 border border-white/10 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                                autoFocus
                                maxLength={6}
                            />

                            {totpError && (
                                <p className="text-sm text-red-400 text-center">{totpError}</p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 p-6 border-t border-white/5">
                            <button
                                onClick={() => {
                                    setTotpModalOpen(false);
                                    setPendingWithdrawalId(null);
                                    setTotpCode('');
                                    setTotpError('');
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApproveSubmit}
                                disabled={totpCode.length !== 6 || processing}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {processing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        Approve Withdrawal
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
