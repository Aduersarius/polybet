'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, Wallet as WalletIcon, Check, X, Shield, Mail, TrendingUp, DollarSign, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getUserFriendlyError } from '@/lib/error-messages';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Navbar } from '@/app/components/Navbar';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

export default function WithdrawPage() {
    const router = useRouter();
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [canWithdraw, setCanWithdraw] = useState(false);
    const [balance, setBalance] = useState(0);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [limits, setLimits] = useState({ maxSingle: 0, maxDaily: 0, usedToday: 0 });
    const [checking, setChecking] = useState(true);
    const [requirements, setRequirements] = useState({
        twoFactorEnabled: false,
        emailVerified: false,
        hasPlacedBet: false,
        hasBalance: false
    });
    // TOTP verification state
    const [showTotpModal, setShowTotpModal] = useState(false);
    const [totpCode, setTotpCode] = useState('');
    const [pendingAmount, setPendingAmount] = useState(0);

    useEffect(() => {
        checkEligibility();
        document.title = 'Withdraw | Pariflow';
    }, []);

    const checkEligibility = async () => {
        setChecking(true);
        try {
            const res = await fetch('/api/crypto/can-withdraw');
            const data = await res.json();
            setCanWithdraw(data.canWithdraw);
            // Ensure balance is always a number (API may return Decimal or string)
            setBalance(Number(data.balance) || 0);
            setReason(data.reason || '');
            setLimits({
                maxSingle: Number(data.maxSingle) || 0,
                maxDaily: Number(data.maxDaily) || 0,
                usedToday: Number(data.usedToday) || 0,
            });
            setRequirements(data.requirements || {
                twoFactorEnabled: false,
                emailVerified: false,
                hasPlacedBet: false,
                hasBalance: false
            });
        } catch (err) {
            console.error('Failed to check eligibility:', err);
            setCanWithdraw(false);
        } finally {
            setChecking(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validate amount
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            setError('Please enter a valid amount greater than $0');
            toast({
                variant: 'warning',
                title: '🔢 Invalid Amount',
                description: 'Please enter a valid amount greater than $0',
            });
            return;
        }

        // Check minimum withdrawal
        if (numAmount < 1) {
            setError('Minimum withdrawal is $1');
            toast({
                variant: 'warning',
                title: '📊 Amount Too Small',
                description: 'Minimum withdrawal amount is $1. Please increase your amount.',
            });
            return;
        }

        // Check balance
        if (numAmount > balance) {
            setError(`You only have $${balance.toFixed(2)} available`);
            toast({
                variant: 'warning',
                title: '💰 Insufficient Balance',
                description: `You only have $${balance.toFixed(2)} available. Please reduce your withdrawal amount.`,
            });
            return;
        }

        // Check single withdrawal limit
        if (numAmount > limits.maxSingle) {
            setError(`Maximum single withdrawal is $${limits.maxSingle.toFixed(2)}`);
            toast({
                variant: 'warning',
                title: '📏 Amount Too High',
                description: `Maximum single withdrawal is $${limits.maxSingle.toLocaleString()}. Please reduce your amount.`,
            });
            return;
        }

        // Check daily withdrawal limit
        const remainingDaily = limits.maxDaily - limits.usedToday;
        if (numAmount > remainingDaily) {
            setError(`Daily limit: $${remainingDaily.toFixed(2)} remaining`);
            toast({
                variant: 'warning',
                title: '📅 Daily Limit Exceeded',
                description: `You have $${remainingDaily.toFixed(2)} remaining in your daily withdrawal limit. Limit resets at midnight UTC.`,
            });
            return;
        }

        // Validate address
        if (!address || !address.startsWith('0x') || address.length !== 42) {
            setError('Please enter a valid Polygon address (0x...)');
            toast({
                variant: 'warning',
                title: '📍 Invalid Address',
                description: 'Please enter a valid Polygon wallet address starting with "0x" and 42 characters long.',
            });
            return;
        }

        // All validations passed - show TOTP modal
        setPendingAmount(numAmount);
        setTotpCode('');
        setShowTotpModal(true);
    };

    const handleWithdrawWithTotp = async () => {
        if (!totpCode || totpCode.length !== 6) {
            toast({
                variant: 'warning',
                title: '🔐 Invalid Code',
                description: 'Please enter a valid 6-digit authenticator code.',
            });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/crypto/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: pendingAmount,
                    address,
                    token: 'USDC',
                    totpCode: totpCode.trim()
                }),
            });

            if (res.ok) {
                setAmount('');
                setAddress('');
                setShowTotpModal(false);
                setTotpCode('');
                toast({
                    variant: 'success',
                    title: '✅ Withdrawal Submitted',
                    description: 'Your withdrawal request has been submitted and is awaiting admin approval. You will be notified once processed.',
                });
                router.push('/transactions');
            } else {
                const data = await res.json();
                const errorMsg = data.error || 'Failed to submit withdrawal';
                setError(errorMsg);

                // Keep modal open for TOTP errors so user can retry
                if (errorMsg.toLowerCase().includes('totp') || errorMsg.toLowerCase().includes('code')) {
                    setTotpCode('');
                    toast({
                        variant: 'destructive',
                        title: '🔐 Invalid Code',
                        description: 'The authenticator code is incorrect. Please try again.',
                    });
                } else {
                    setShowTotpModal(false);
                    const { title, description, variant } = getUserFriendlyError(new Error(errorMsg));
                    toast({ variant, title, description });
                }
            }
        } catch (err) {
            const errorMsg = 'Network error. Please try again.';
            setError(errorMsg);
            setShowTotpModal(false);
            toast({
                variant: 'destructive',
                title: '🌐 Connection Error',
                description: 'Unable to connect to the server. Please check your internet connection and try again.',
            });
        } finally {
            setLoading(false);
        }
    };

    const requirementItems = [
        {
            key: 'twoFactorEnabled',
            icon: Shield,
            label: 'Two-Factor Authentication',
            description: 'Enable 2FA in your settings',
            action: '/settings?setup2fa=true',
            actionLabel: 'Enable 2FA'
        },
        {
            key: 'emailVerified',
            icon: Mail,
            label: 'Email Verified',
            description: 'Verify your email address',
            action: '/settings?category=account',
            actionLabel: 'Verify Email'
        },
        {
            key: 'hasPlacedBet',
            icon: TrendingUp,
            label: 'Place at Least One Bet',
            description: 'Make a bet or trade to enable withdrawals',
            action: '/',
            actionLabel: 'Place a Bet'
        },
        {
            key: 'hasBalance',
            icon: DollarSign,
            label: 'Sufficient Balance',
            description: `Balance: $${balance.toFixed(2)}`,
            action: null,
            actionLabel: null
        }
    ];

    return (
        <div className="min-h-screen text-white relative z-10 flex flex-col">
            <Navbar />

            <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1" style={{ paddingTop: 'calc(var(--navbar-height) + 1.5rem)' }}>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    <Link
                        href="/profile"
                        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white mb-5 transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                    </Link>
                    <div className="flex items-start gap-3 mb-1">
                        <WalletIcon className="w-6 h-6 text-blue-400 mt-1 flex-shrink-0" />
                        <div>
                            <h1 className="text-3xl font-bold text-white leading-tight mb-1">
                                Withdraw Funds
                            </h1>
                            <p className="text-sm text-zinc-500">Request a withdrawal to your Polygon wallet</p>
                        </div>
                    </div>
                </motion.div>

                {/* Content */}
                {checking ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="flex flex-col items-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                            <p className="text-sm text-zinc-500">Checking eligibility...</p>
                        </div>
                    </div>
                ) : !canWithdraw ? (
                    <div className="space-y-5">
                        {/* Status Alert */}
                        <div className="bg-zinc-800/50 rounded-xl border border-yellow-500/20 p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-white mb-1">Withdrawal Not Available</h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">{reason}</p>
                                </div>
                            </div>
                        </div>

                        {/* Requirements Checklist - Inline Style */}
                        <div className="bg-zinc-800/50 rounded-xl border border-white/10 p-5">
                            <h4 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">Requirements</h4>

                            <div className="space-y-3">
                                {requirementItems.map((item) => {
                                    const isMet = requirements[item.key as keyof typeof requirements];
                                    const Icon = item.icon;

                                    return (
                                        <div
                                            key={item.key}
                                            className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${isMet ? 'bg-green-500/5' : 'bg-red-500/5'
                                                }`}
                                        >
                                            <div className={`mt-0.5 flex-shrink-0 ${isMet ? 'text-green-400' : 'text-red-400'
                                                }`}>
                                                {isMet ? (
                                                    <Check className="w-4 h-4" />
                                                ) : (
                                                    <X className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <Icon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                                    <span className="text-sm font-medium text-white">{item.label}</span>
                                                </div>
                                                <p className="text-xs text-zinc-500 mb-2">{item.description}</p>
                                                {!isMet && item.action && (
                                                    <Link
                                                        href={item.action}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                                                    >
                                                        {item.actionLabel}
                                                        <ArrowLeft className="w-3 h-3 rotate-180" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-5">
                        {/* Main Form */}
                        <div className="flex-1 space-y-5">
                            {/* Requirements Status - Compact */}
                            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-green-500/10 rounded-lg border border-green-500/20">
                                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                                <span className="text-sm text-green-400 font-medium">All requirements met</span>
                            </div>

                            {/* Balance Display */}
                            <div className="bg-zinc-800/50 rounded-xl border border-white/10 p-4">
                                <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Available Balance</span>
                                    <span className="text-2xl font-bold text-white">${balance.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Withdrawal Form */}
                            <div className="bg-zinc-800/50 rounded-xl border border-white/10 p-5 space-y-5">
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {/* Amount Input */}
                                    <div>
                                        <label className="flex items-center gap-1.5 text-sm text-zinc-400 mb-2">
                                            Amount (USD)
                                            <InfoTooltip
                                                content="Minimum withdrawal: $10. Enter the amount you want to withdraw from your balance."
                                                side="top"
                                            />
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-base">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max={balance}
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-base focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-colors"
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAmount(balance.toString())}
                                            className="mt-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            Use maximum: ${balance.toFixed(2)}
                                        </button>
                                    </div>

                                    {/* Address Input */}
                                    <div>
                                        <label className="flex items-center gap-1.5 text-sm text-zinc-400 mb-2">
                                            Destination Address (Polygon)
                                            <InfoTooltip
                                                content="Enter your Polygon wallet address (starts with 0x). Funds will be sent as USDC on Polygon network. Make sure this address can receive USDC tokens."
                                                side="top"
                                            />
                                        </label>
                                        <input
                                            type="text"
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-colors"
                                            placeholder="0x..."
                                            required
                                        />
                                    </div>

                                    {/* Error */}
                                    {error && (
                                        <div className="rounded-lg bg-red-500/10 p-3 border border-red-500/20">
                                            <p className="text-sm text-red-400">{error}</p>
                                        </div>
                                    )}

                                    {/* Submit Button */}
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
                            </div>
                        </div>

                        {/* Sidebar Info */}
                        <div className="lg:w-64 flex-shrink-0 space-y-4">
                            {/* Limits */}
                            {limits.maxSingle > 0 && (
                                <div className="bg-zinc-800/50 rounded-xl border border-white/10 p-4">
                                    <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Withdrawal Limits</div>
                                    <div className="space-y-2.5 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-400">Max per withdrawal</span>
                                            <span className="text-white font-medium">${limits.maxSingle.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-400">Daily remaining</span>
                                            <span className="text-emerald-400 font-medium">${(limits.maxDaily - limits.usedToday).toLocaleString()}</span>
                                        </div>
                                        <div className="pt-2">
                                            <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-emerald-500 transition-all duration-500"
                                                    style={{ width: `${Math.min(100, ((limits.maxDaily - limits.usedToday) / limits.maxDaily * 100))}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Warning */}
                            <div className="bg-yellow-500/10 rounded-xl border border-yellow-500/20 p-3.5">
                                <div className="flex items-start gap-2.5">
                                    <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-xs font-medium text-yellow-400 mb-1">Important</div>
                                        <p className="text-xs text-yellow-300/80 leading-relaxed">
                                            Withdrawals require admin approval. Funds will be sent as USDC on Polygon network.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* TOTP Verification Modal */}
            <AnimatePresence>
                {showTotpModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => {
                            if (!loading) {
                                setShowTotpModal(false);
                                setTotpCode('');
                            }
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                    <Shield className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Confirm Withdrawal</h3>
                                    <p className="text-sm text-zinc-400">Enter your 2FA code to proceed</p>
                                </div>
                            </div>

                            <div className="bg-zinc-800/50 rounded-lg p-4 mb-5 border border-white/5">
                                <div className="flex justify-between items-center text-sm mb-2">
                                    <span className="text-zinc-400">Amount</span>
                                    <span className="text-white font-semibold">${pendingAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-400">To Address</span>
                                    <span className="text-white font-mono text-xs truncate max-w-[180px]">{address}</span>
                                </div>
                            </div>

                            <div className="mb-5">
                                <label className="block text-sm text-zinc-400 mb-2">Authenticator Code</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-colors"
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowTotpModal(false);
                                        setTotpCode('');
                                    }}
                                    disabled={loading}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-zinc-400 font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleWithdrawWithTotp}
                                    disabled={loading || totpCode.length !== 6}
                                    className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <WalletIcon className="w-4 h-4" />
                                            Confirm
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
