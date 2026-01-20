'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Wallet as WalletIcon, ChevronDown, Check, AlertCircle, Info, Shield, TrendingUp, ExternalLink } from 'lucide-react';
import { USDCIcon, USDTIcon, PolygonIcon, EthereumIcon, BNBIcon, ArbitrumIcon } from '@/components/ui/CryptoIcons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { sanitizeUrl } from '@/lib/utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import Link from 'next/link';

interface EnhancedWithdrawModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

type CryptoNetwork = 'polygon-usdc' | 'ethereum-usdt' | 'bsc-usdt' | 'arbitrum-usdc';

const cryptoNetworks = [
    {
        id: 'polygon-usdc',
        name: 'USDC',
        chain: 'Polygon',
        token: 'USDC',
        CoinIcon: USDCIcon,
        ChainIcon: PolygonIcon
    },
    {
        id: 'ethereum-usdt',
        name: 'USDT',
        chain: 'Ethereum',
        token: 'USDT',
        CoinIcon: USDTIcon,
        ChainIcon: EthereumIcon
    },
    {
        id: 'bsc-usdt',
        name: 'USDT',
        chain: 'BSC',
        token: 'USDT',
        CoinIcon: USDTIcon,
        ChainIcon: BNBIcon
    },
    {
        id: 'arbitrum-usdc',
        name: 'USDC',
        chain: 'Arbitrum',
        token: 'USDC',
        CoinIcon: USDCIcon,
        ChainIcon: ArbitrumIcon
    },
];

export function EnhancedWithdrawModal({ isOpen, onClose, onSuccess }: EnhancedWithdrawModalProps) {
    const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetwork>('polygon-usdc');
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [balance, setBalance] = useState<number | null>(null);
    const [canWithdraw, setCanWithdraw] = useState(false);
    const [withdrawReason, setWithdrawReason] = useState('');
    const [limits, setLimits] = useState({ maxSingle: 0, maxDaily: 0, usedToday: 0 });
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [hasPlacedBet, setHasPlacedBet] = useState(false);
    const [hasSufficientBalance, setHasSufficientBalance] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(false);

    const fetchBalance = async () => {
        try {
            const res = await fetch('/api/balance', {
                credentials: 'include',
            });
            if (!res.ok) return;
            const data = await res.json();
            setBalance(Number(data.balance ?? 0));
        } catch (err) {
            console.error('Failed to fetch balance', err);
        }
    };

    const checkEligibility = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/crypto/can-withdraw', {
                credentials: 'include',
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                setCanWithdraw(false);
                setWithdrawReason(errorData.reason || 'Unable to check withdrawal eligibility. Please try again.');
                setIs2FAEnabled(errorData.reason !== 'Two-factor authentication is required to withdraw');
                setHasPlacedBet(errorData.reason !== 'You must place at least one bet before requesting a withdrawal');
                setHasSufficientBalance(errorData.reason !== 'Insufficient balance');
                setIsEmailVerified(errorData.reason !== 'Email must be verified to withdraw');
                return;
            }

            const data = await res.json();
            setCanWithdraw(data.canWithdraw || false);
            setWithdrawReason(data.reason || '');

            if (data.balance !== undefined) {
                const balanceValue = typeof data.balance === 'string' ? parseFloat(data.balance) : Number(data.balance);
                setBalance(balanceValue);
                setHasSufficientBalance(balanceValue > 0);
            } else {
                setHasSufficientBalance(false);
            }

            if (data.limits) {
                setLimits({
                    maxSingle: data.limits.single || 0,
                    maxDaily: data.limits.daily || 0,
                    usedToday: data.limits.usedToday || 0,
                });
            } else if (data.canWithdraw) {
                setLimits({
                    maxSingle: 5000,
                    maxDaily: 20000,
                    usedToday: 0,
                });
            } else {
                setLimits({
                    maxSingle: 0,
                    maxDaily: 0,
                    usedToday: 0,
                });
            }

            setIs2FAEnabled(data.is2FAEnabled ?? true);
            setHasPlacedBet(data.hasPlacedBet ?? true);
            setIsEmailVerified(data.isEmailVerified ?? true);

        } catch (err) {
            console.error('[WithdrawModal] Failed to check eligibility:', err);
            setCanWithdraw(false);
            setWithdrawReason('Network error. Please check your connection and try again.');
            setIs2FAEnabled(false);
            setHasPlacedBet(false);
            setHasSufficientBalance(false);
            setIsEmailVerified(false);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleNetworkChange = (networkId: CryptoNetwork) => {
        setSelectedNetwork(networkId);
        setShowNetworkDropdown(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            setError('Please enter a valid amount greater than $0');
            toast({
                variant: 'destructive',
                title: 'Invalid Amount',
                description: 'Please enter a valid amount greater than $0',
            });
            return;
        }

        if (numAmount < 10) {
            setError('Minimum withdrawal is $10');
            return;
        }

        if (balance !== null && numAmount > balance) {
            setError(`You only have $${balance.toFixed(2)} available`);
            return;
        }

        if (numAmount > limits.maxSingle) {
            setError(`Maximum single withdrawal is $${limits.maxSingle.toFixed(2)}`);
            return;
        }

        const remainingDaily = limits.maxDaily - limits.usedToday;
        if (numAmount > remainingDaily) {
            setError(`Daily limit: $${remainingDaily.toFixed(2)} remaining`);
            return;
        }

        if (!address || !address.startsWith('0x') || address.length !== 42) {
            setError('Please enter a valid wallet address (0x...)');
            return;
        }

        if (!totpCode || totpCode.length !== 6 || !/^\d{6}$/.test(totpCode)) {
            setError('Please enter a valid 6-digit TOTP code');
            return;
        }

        setSubmitting(true);
        try {
            const selectedNetworkData = cryptoNetworks.find(n => n.id === selectedNetwork);
            const token = selectedNetworkData?.token || 'USDC';

            const res = await fetch('/api/crypto/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    amount: numAmount,
                    address,
                    token,
                    totpCode,
                }),
            });

            if (res.ok) {
                setAmount('');
                setAddress('');
                setTotpCode('');
                toast({
                    variant: 'default',
                    title: '✅ Withdrawal Submitted',
                    description: 'Your withdrawal request has been submitted and is awaiting admin approval.',
                });
                onSuccess?.();
                onClose();
            } else {
                const data = await res.json();
                const errorMsg = data.error || 'Failed to submit withdrawal';
                setError(errorMsg);
                const { title, description, variant } = getUserFriendlyError(new Error(errorMsg));
                toast({ variant, title, description });
            }
        } catch (err) {
            setError('Network error. Please try again.');
            toast({
                variant: 'destructive',
                title: 'Connection Error',
                description: 'Unable to connect to the server. Please check your internet connection and try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchBalance();
            checkEligibility();

            const interval = setInterval(() => {
                if (!canWithdraw) {
                    checkEligibility();
                }
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [isOpen, canWithdraw, checkEligibility]);

    if (!isOpen) return null;

    const selectedNetworkData = cryptoNetworks.find(n => n.id === selectedNetwork);

    const checklistItems = [
        {
            id: 'emailVerified',
            label: 'Verify your email address',
            completed: isEmailVerified,
            link: '/settings'
        },
        {
            id: '2fa',
            label: 'Enable Two-Factor Authentication (2FA)',
            completed: is2FAEnabled,
            link: '/settings'
        },
        {
            id: 'firstBet',
            label: 'Place at least one bet or trade',
            completed: hasPlacedBet,
            link: '/'
        },
        {
            id: 'sufficientBalance',
            label: 'Have sufficient balance',
            completed: hasSufficientBalance,
            link: null
        },
    ].filter(item => !item.completed);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-4">
            <div className="relative w-full max-w-md mx-auto">
                <div className="relative p-5 bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

                    {/* Header */}
                    <div className="relative flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold text-white">Withdraw Crypto</h2>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-xs text-white/50">Balance:</span>
                                <span className="text-sm font-semibold text-white">
                                    {balance !== null ? `$${balance.toFixed(2)}` : '$0.00'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                        >
                            <X className="w-4 h-4 text-white/50" />
                        </button>
                    </div>

                    {/* Content */}
                    {!canWithdraw ? (
                        <div className="relative space-y-4">
                            <div className="flex flex-col items-center mb-4">
                                <div className="p-4 rounded-full bg-yellow-500/20 mb-4 ring-4 ring-yellow-500/10">
                                    <AlertCircle className="w-8 h-8 text-yellow-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2 text-center">Withdrawal Not Available</h3>
                                <p className="text-sm text-white/80 text-center mb-4 px-2 leading-relaxed">{withdrawReason || 'Unable to withdraw at this time'}</p>
                            </div>

                            {/* Requirements Checklist */}
                            {checklistItems.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-sm font-semibold text-white mb-2">Complete these requirements to enable withdrawals:</p>
                                    {checklistItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.completed
                                                    ? 'bg-emerald-500/20 border-emerald-500/40'
                                                    : 'bg-white/5 border-white/10'
                                                }`}
                                        >
                                            <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${item.completed
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'bg-white/10 border border-white/20'
                                                }`}>
                                                {item.completed && <Check className="w-3 h-3" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium ${item.completed ? 'text-emerald-400' : 'text-white'}`}>
                                                    {item.label}
                                                </p>
                                            </div>
                                            {item.link && !item.completed && (
                                                <Link
                                                    href={sanitizeUrl(item.link)}
                                                    onClick={() => onClose()}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 text-xs font-medium transition-all"
                                                >
                                                    {item.link === '/settings' ? (
                                                        <>
                                                            <Shield className="w-3 h-3" />
                                                            <span>Settings</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TrendingUp className="w-3 h-3" />
                                                            <span>Trade</span>
                                                        </>
                                                    )}
                                                </Link>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                                {!is2FAEnabled && (
                                    <Link
                                        href="/settings"
                                        onClick={() => onClose()}
                                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-400 text-sm font-medium transition-all"
                                    >
                                        <Shield className="w-4 h-4" />
                                        Enable 2FA in Settings
                                    </Link>
                                )}
                                {!hasPlacedBet && (
                                    <Link
                                        href="/"
                                        onClick={() => onClose()}
                                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-all"
                                    >
                                        <TrendingUp className="w-4 h-4" />
                                        Go to Markets
                                    </Link>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="relative space-y-4">
                            {/* Withdrawal Limits Info */}
                            {limits.maxSingle > 0 && (
                                <div className="rounded-lg bg-blue-500/10 p-3 border border-blue-500/20 space-y-2">
                                    <p className="text-xs text-blue-300 font-medium">Withdrawal Limits</p>
                                    <div className="space-y-1 text-xs text-white/70">
                                        <div className="flex justify-between">
                                            <span>Max per withdrawal:</span>
                                            <span className="text-white font-medium">${limits.maxSingle.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Daily limit remaining:</span>
                                            <span className="text-emerald-400 font-medium">${(limits.maxDaily - limits.usedToday).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Network Selector */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-white/80 mb-2">Select Network</label>
                                <button
                                    type="button"
                                    onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:border-blue-400/30 text-white flex items-center justify-between hover:bg-white/10 transition-all group"
                                >
                                    <div className="flex items-center gap-2">
                                        {selectedNetworkData?.ChainIcon && <selectedNetworkData.ChainIcon size={20} />}
                                        <span className="font-medium">{selectedNetworkData?.name}</span>
                                        <span className="text-white/50 text-sm">({selectedNetworkData?.chain})</span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-white/50 group-hover:text-white transition-all ${showNetworkDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showNetworkDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-1 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-[100] overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
                                        {cryptoNetworks.map((network) => (
                                            <button
                                                key={network.id}
                                                type="button"
                                                onClick={() => handleNetworkChange(network.id as CryptoNetwork)}
                                                className="w-full p-3 text-left hover:bg-blue-500/10 transition-all flex items-center justify-between group/item border-b border-white/5 last:border-0"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <network.CoinIcon size={18} />
                                                    <div>
                                                        <p className="text-white text-sm font-medium group-hover/item:text-blue-300 transition-colors">{network.name} ({network.chain})</p>
                                                    </div>
                                                </div>
                                                {selectedNetwork === network.id && (
                                                    <div className="p-1 rounded-full bg-emerald-500/20">
                                                        <Check className="w-3 h-3 text-emerald-400" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="flex items-center gap-1.5 text-sm font-medium text-white/80 mb-2">
                                    Amount (USD)
                                    <Info className="w-3.5 h-3.5 text-white/40" />
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max={balance || undefined}
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-blue-400/30 transition-colors text-sm"
                                        placeholder="0.00"
                                        required
                                        disabled={submitting}
                                    />
                                </div>
                                {balance !== null && (
                                    <button
                                        type="button"
                                        onClick={() => setAmount(balance.toString())}
                                        className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        Max: ${balance.toFixed(2)}
                                    </button>
                                )}
                            </div>

                            {/* Wallet Address */}
                            <div>
                                <label className="flex items-center gap-1.5 text-sm font-medium text-white/80 mb-2">
                                    Destination Address
                                    <Info className="w-3.5 h-3.5 text-white/40" />
                                </label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value.trim())}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm placeholder-white/40 focus:outline-none focus:border-blue-400/30 transition-colors"
                                    placeholder="0x..."
                                    required
                                    disabled={submitting}
                                />
                                <p className="mt-1 text-xs text-white/40">
                                    Enter your {selectedNetworkData?.chain} wallet address for {selectedNetworkData?.name}
                                </p>
                            </div>

                            {/* TOTP Code */}
                            <div>
                                <label className="flex items-center gap-1.5 text-sm font-medium text-white/80 mb-2">
                                    2FA Verification Code
                                    <Info className="w-3.5 h-3.5 text-white/40" />
                                </label>
                                <input
                                    type="text"
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-center text-xl tracking-widest font-mono focus:outline-none focus:border-blue-400/30 transition-colors placeholder-white/30"
                                    placeholder="000000"
                                    maxLength={6}
                                    required
                                    disabled={submitting}
                                    autoComplete="one-time-code"
                                />
                                <p className="mt-1 text-xs text-white/40">
                                    Enter the 6-digit code from your authenticator app
                                </p>
                            </div>

                            {/* Warning */}
                            <div className="rounded-lg bg-amber-500/10 p-3 border border-amber-400/20">
                                <p className="text-xs text-amber-200 leading-tight">
                                    <strong className="text-amber-300">⚠️ Important:</strong> Withdrawals require admin approval. Funds will be sent as <strong className="text-white">{selectedNetworkData?.name}</strong> on <strong className="text-white">{selectedNetworkData?.chain}</strong> network.
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
                                disabled={submitting || loading}
                                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-500/20"
                            >
                                {submitting ? (
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
        </div>
    );
}

