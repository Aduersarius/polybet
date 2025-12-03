'use client';

import React, { useEffect, useState } from 'react';
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

export default function AdminWithdrawalsPage() {
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWithdrawals();
    }, []);

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
        totalAmount: withdrawals.filter(w => w.status === 'PENDING').reduce((sum, w) => sum + w.amount, 0),
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black p-8">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="mb-2 text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                        Withdrawal Management
                    </h1>
                    <p className="text-zinc-400">Review and approve user withdrawal requests</p>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-6 md:grid-cols-3 mb-8">
                    <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-zinc-400">Pending Requests</p>
                                <p className="mt-2 text-3xl font-bold text-white">{stats.pending}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-yellow-500/10">
                                <Clock className="w-6 h-6 text-yellow-400" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-zinc-400">Total Amount Pending</p>
                                <p className="mt-2 text-3xl font-bold text-white">${stats.totalAmount.toFixed(2)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-500/10">
                                <Wallet className="w-6 h-6 text-blue-400" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-zinc-400">Total Processed</p>
                                <p className="mt-2 text-3xl font-bold text-white">{withdrawals.length - stats.pending}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-green-500/10">
                                <TrendingUp className="w-6 h-6 text-green-400" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Withdrawals Table */}
                <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 backdrop-blur-sm">
                    <div className="p-6 border-b border-white/10">
                        <h2 className="text-lg font-semibold text-white">Withdrawal Requests</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-800/50 text-xs uppercase text-zinc-400 border-b border-white/10">
                                <tr>
                                    <th className="px-6 py-4 font-medium">User</th>
                                    <th className="px-6 py-4 font-medium">Amount</th>
                                    <th className="px-6 py-4 font-medium">Destination</th>
                                    <th className="px-6 py-4 font-medium">Date</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                                                Loading...
                                            </div>
                                        </td>
                                    </tr>
                                ) : withdrawals.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">
                                            No withdrawal requests found
                                        </td>
                                    </tr>
                                ) : (
                                    withdrawals.map((w) => (
                                        <tr key={w.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-white">{w.user.username || 'Unknown'}</div>
                                                <div className="text-xs text-zinc-400">{w.user.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white">${w.amount.toFixed(2)}</div>
                                                <div className="text-xs text-zinc-400">{w.currency}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-mono text-xs text-zinc-300 max-w-[200px] truncate">
                                                    {w.toAddress}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-zinc-400">
                                                {new Date(w.createdAt).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${w.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                                        w.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
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
                                                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
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
        </div>
    );
}
