'use client';

import { useState, useEffect } from 'react';
import { X, AlertCircle, Wallet as WalletIcon } from 'lucide-react';

interface WithdrawModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [canWithdraw, setCanWithdraw] = useState(false);
    const [balance, setBalance] = useState(0);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            checkEligibility();
        }
    }, [isOpen]);

    const checkEligibility = async () => {
        try {
            const res = await fetch('/api/crypto/can-withdraw');
            const data = await res.json();
            setCanWithdraw(data.canWithdraw);
            setBalance(data.balance || 0);
            setReason(data.reason || '');
        } catch (err) {
            console.error('Failed to check eligibility:', err);
            setCanWithdraw(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        if (numAmount > balance) {
            setError('Insufficient balance');
            return;
        }

        if (!address || !address.startsWith('0x') || address.length !== 42) {
            setError('Please enter a valid Polygon address');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/crypto/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: numAmount, address }),
            });

            if (res.ok) {
                setAmount('');
                setAddress('');
                onSuccess?.();
                onClose();
                alert('Withdrawal request submitted! Awaiting admin approval.');
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to submit withdrawal');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-6 bg-[#1a1d2e] border border-white/10 rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Withdraw</h2>
                        <p className="text-sm text-zinc-400">Balance: ${balance.toFixed(2)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {/* Content */}
                {!canWithdraw ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="p-4 rounded-full bg-yellow-500/10 mb-4">
                            <AlertCircle className="w-8 h-8 text-yellow-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Withdrawal Not Available</h3>
                        <p className="text-sm text-zinc-400 text-center">{reason}</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Amount */}
                        <div>
                            <label className="block text-sm text-zinc-400 mb-2">Amount (USD)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={balance}
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setAmount(balance.toString())}
                                className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Max: ${balance.toFixed(2)}
                            </button>
                        </div>

                        {/* Address */}
                        <div>
                            <label className="block text-sm text-zinc-400 mb-2">Destination Address (Polygon)</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                                placeholder="0x..."
                                required
                            />
                        </div>

                        {/* Warning */}
                        <div className="rounded-lg bg-yellow-500/10 p-4 border border-yellow-500/20">
                            <p className="text-sm text-yellow-400">
                                <strong>⚠️ Important:</strong> Withdrawals require admin approval. Funds will be sent as USDC on Polygon network.
                            </p>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 border border-red-500/20">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <WalletIcon className="w-4 h-4" />
                                    Request Withdrawal
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
