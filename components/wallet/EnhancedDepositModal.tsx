'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Zap, CreditCard, Building2, Repeat, Wallet as WalletIcon, ChevronDown, Copy, Check, Loader2 } from 'lucide-react';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';
import { USDCIcon, USDTIcon, PolygonIcon, EthereumIcon, BNBIcon, ArbitrumIcon } from '@/components/ui/CryptoIcons';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { track } from '@vercel/analytics/react';

interface EnhancedDepositModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBalanceUpdate?: () => void;
}

type PaymentMethod = 'crypto' | 'card' | 'sepa' | 'exchange' | 'paypal';
type CryptoNetwork = 'polygon-usdc' | 'ethereum-usdt' | 'bsc-usdt' | 'arbitrum-usdc';

const cryptoNetworks = [
    {
        id: 'polygon-usdc',
        name: 'USDC',
        chain: 'Polygon',
        fee: '1%',
        CoinIcon: USDCIcon,
        ChainIcon: PolygonIcon
    },
    {
        id: 'ethereum-usdt',
        name: 'USDT',
        chain: 'Ethereum',
        fee: '2%',
        CoinIcon: USDTIcon,
        ChainIcon: EthereumIcon
    },
    {
        id: 'bsc-usdt',
        name: 'USDT',
        chain: 'BSC',
        fee: '1.5%',
        CoinIcon: USDTIcon,
        ChainIcon: BNBIcon
    },
    {
        id: 'arbitrum-usdc',
        name: 'USDC',
        chain: 'Arbitrum',
        fee: '0.5%',
        CoinIcon: USDCIcon,
        ChainIcon: ArbitrumIcon
    },
];

export function EnhancedDepositModal({ isOpen, onClose, onBalanceUpdate }: EnhancedDepositModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetwork>('polygon-usdc');
    const [depositAddress, setDepositAddress] = useState<string>('');
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

    // Deposit tracking state
    const [depositStatus, setDepositStatus] = useState<'idle' | 'detected' | 'confirmed'>('idle');
    const [detectedAmount, setDetectedAmount] = useState<number>(0);
    const lastDepositIdRef = useRef<string | null>(null);
    const mountTimeRef = useRef<number>(Date.now());
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const { toast } = useToast();

    const fetchBalance = async () => {
        try {
            const res = await fetch('/api/balance', {
                credentials: 'include', // Include cookies for authentication
            });
            if (!res.ok) return;
            const data = await res.json();
            setBalance(Number(data.balance ?? 0));
        } catch (err) {
            console.error('Failed to fetch balance', err);
        }
    };

    // Fetch deposit address when crypto is selected
    const fetchDepositAddress = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/crypto/deposit', {
                credentials: 'include', // Include cookies for authentication
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to fetch deposit address' }));
                console.error('Failed to fetch deposit address:', response.status, errorData);
                setDepositAddress(''); // Clear address on error
                return;
            }

            const data = await response.json();
            if (data.address) {
                setDepositAddress(data.address);
            } else {
                console.error('No address in response:', data);
                setDepositAddress('');
            }
        } catch (error) {
            console.error('Failed to fetch deposit address:', error);
            setDepositAddress(''); // Clear address on error
        } finally {
            setLoading(false);
        }
    };

    const handleMethodSelect = async (method: PaymentMethod) => {
        setSelectedMethod(method);
        if (method === 'crypto' && !depositAddress) {
            await fetchDepositAddress();
        }
    };

    const handleNetworkChange = (networkId: CryptoNetwork) => {
        setSelectedNetwork(networkId);
        setShowNetworkDropdown(false);
        // In future: fetch different address for different networks
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(depositAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Handle Enter key for navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // If showing success state, close modal
                if (depositStatus === 'confirmed') {
                    setDepositStatus('idle');
                    onClose();
                    return;
                }
                // If no method selected, select crypto (the only active option)
                if (!selectedMethod) {
                    handleMethodSelect('crypto');
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, depositStatus, selectedMethod, onClose]);

    useEffect(() => {
        if (isOpen) {
            fetchBalance();
            mountTimeRef.current = Date.now();
            setDepositStatus('idle');

            // Initial fetch to set baseline
            fetch('/api/user/deposits/latest')
                .then(res => res.json())
                .then(data => {
                    if (data.deposit) {
                        lastDepositIdRef.current = data.deposit.id;
                    }
                })
                .catch(console.error);

            // Start Polling
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const res = await fetch('/api/user/deposits/latest');
                    if (!res.ok) return;
                    const data = await res.json();
                    const deposit = data.deposit;

                    if (deposit && deposit.id !== lastDepositIdRef.current) {
                        const depositTime = new Date(deposit.createdAt).getTime();

                        // Only care if it's new since we opened modal (or reasonably recent)
                        if (depositTime > mountTimeRef.current - 10000) { // 10s buffer
                            lastDepositIdRef.current = deposit.id;
                            setDetectedAmount(Number(deposit.amount));

                            // If it's already completed or close to it
                            if (deposit.status === 'COMPLETED') {
                                setDepositStatus('confirmed');
                                fetchBalance();
                                if (onBalanceUpdate) onBalanceUpdate();
                                toast({
                                    title: "Deposit Successful",
                                    description: `$${Number(deposit.amount).toFixed(2)} USDC has been added to your balance.`,
                                    variant: "default", // Success variant if available
                                });
                                track('Deposit', {
                                    amount: Number(deposit.amount),
                                    currency: 'USDC',
                                    chain: 'Polygon',
                                    status: 'confirmed'
                                });
                            } else {
                                setDepositStatus('detected');
                                toast({
                                    title: "Payment Detected",
                                    description: "We are processing your deposit...",
                                });
                            }
                        }
                    } else if (deposit && deposit.id === lastDepositIdRef.current && depositStatus === 'detected') {
                        // Check if status changed from detected to confirmed
                        if (deposit.status === 'COMPLETED') {
                            setDepositStatus('confirmed');
                            fetchBalance();
                            if (onBalanceUpdate) onBalanceUpdate();
                            toast({
                                title: "Deposit Confirmed",
                                description: "Your funds are now available to trade.",
                            });
                            track('Deposit', {
                                amount: Number(deposit.amount),
                                currency: 'USDC',
                                chain: 'Polygon',
                                status: 'confirmed'
                            });
                        }
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 3000); // Check every 3 seconds
        }

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const selectedNetworkData = cryptoNetworks.find(n => n.id === selectedNetwork);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-4">
            <div className="relative w-full max-w-md mx-auto">
                {/* Glassmorphism card with gradient border */}
                <div className="relative p-5 bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10">
                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

                    {/* Header */}
                    <div className="relative flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold text-white">Transfer Crypto</h2>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-xs text-white/50">Balance:</span>
                                <span className="text-sm font-semibold text-white">
                                    {balance !== null ? `$${balance.toFixed(2)}` : '$0.00'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => selectedMethod ? setSelectedMethod(null) : onClose()}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                        >
                            <X className="w-4 h-4 text-white/50" />
                        </button>
                    </div>

                    {/* Payment Methods */}
                    {!selectedMethod && (
                        <div className="relative space-y-4">
                            {/* Crypto - Active */}
                            <button
                                onClick={() => handleMethodSelect('crypto')}
                                className="relative w-full p-3.5 rounded-lg bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-400/30 hover:border-blue-400/50 transition-all text-left group hover:shadow-[0_0_24px_rgba(59,130,246,0.15)] overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="relative flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-400/20 group-hover:scale-110 transition-transform">
                                            <Zap className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white group-hover:text-blue-300 transition-colors">Transfer Crypto</p>
                                            <p className="text-xs text-white/60 mt-0.5">No limit • Instant</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <PolygonIcon size={20} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <EthereumIcon size={20} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <BNBIcon size={20} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <ArbitrumIcon size={20} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            </button>

                            {/* Card - Coming Soon */}
                            <button
                                className="relative w-full p-3.5 rounded-lg bg-white/5 border border-white/10 transition-all text-left opacity-50 cursor-not-allowed overflow-hidden"
                                disabled
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-400/10">
                                            <CreditCard className="w-5 h-5 text-purple-400/70" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-white/70">Deposit with Card</p>
                                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                                                    Coming Soon
                                                </span>
                                            </div>
                                            <p className="text-xs text-white/40 mt-0.5">$50,000 • 5 min</p>
                                        </div>
                                    </div>
                                    <span className="text-base opacity-50">💳</span>
                                </div>
                            </button>

                            {/* SEPA - Coming Soon */}
                            <button
                                className="relative w-full p-3.5 rounded-lg bg-white/5 border border-white/10 transition-all text-left opacity-50 cursor-not-allowed overflow-hidden"
                                disabled
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/10">
                                            <Building2 className="w-5 h-5 text-emerald-400/70" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-white/70">Deposit with SEPA</p>
                                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                                                    Coming Soon
                                                </span>
                                            </div>
                                            <p className="text-xs text-white/40 mt-0.5">No limit • 1-2 business days</p>
                                        </div>
                                    </div>
                                </div>
                            </button>

                            {/* Exchange - Coming Soon */}
                            <button
                                className="relative w-full p-4 rounded-xl bg-white/5 border border-white/10 transition-all text-left opacity-50 cursor-not-allowed overflow-hidden"
                                disabled
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-400/10">
                                            <Repeat className="w-5 h-5 text-yellow-400/70" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-white/70">Connect Exchange</p>
                                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                                                    Coming Soon
                                                </span>
                                            </div>
                                            <p className="text-xs text-white/40 mt-0.5">No limit • 2 min</p>
                                        </div>
                                    </div>
                                </div>
                            </button>

                            {/* PayPal - Coming Soon */}
                            <button
                                className="relative w-full p-3.5 rounded-lg bg-white/5 border border-white/10 transition-all text-left opacity-50 cursor-not-allowed overflow-hidden"
                                disabled
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-blue-400/10 border border-blue-400/10">
                                            <WalletIcon className="w-5 h-5 text-blue-300/70" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-white/70">Deposit with PayPal</p>
                                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                                                    Coming Soon
                                                </span>
                                            </div>
                                            <p className="text-xs text-white/40 mt-0.5">$10,000 • 6 min</p>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Crypto Details */}
                    {selectedMethod === 'crypto' && (
                        <div className="relative space-y-6">
                            {/* Back Button */}
                            <button
                                onClick={() => setSelectedMethod(null)}
                                className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5 group mb-2"
                            >
                                <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
                                <span>Back to payment methods</span>
                            </button>

                            {/* Network Selector */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-white/80 mb-3">Select Network</label>
                                <button
                                    onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                                    className="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-blue-400/30 text-white flex items-center justify-between hover:bg-white/10 transition-all group"
                                >
                                    <div className="flex items-center gap-2.5">
                                        {selectedNetworkData?.ChainIcon && <selectedNetworkData.ChainIcon size={24} />}
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
                                                onClick={() => handleNetworkChange(network.id as CryptoNetwork)}
                                                className="w-full p-3 text-left hover:bg-blue-500/10 transition-all flex items-center justify-between group/item border-b border-white/5 last:border-0"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <network.ChainIcon size={20} />
                                                    <div>
                                                        <p className="text-white text-sm font-medium group-hover/item:text-blue-300 transition-colors">{network.name} ({network.chain})</p>
                                                        <p className="text-xs text-white/50">Fee: {network.fee}</p>
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

                            {/* QR Code & Address */}
                            {loading ? (
                                <div className="flex justify-center py-6">
                                    <div className="relative">
                                        <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-500/30 border-t-blue-500" />
                                        <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
                                    </div>
                                </div>
                            ) : depositAddress ? (
                                <>
                                    {/* QR Code - fills container */}
                                    <div className="flex justify-center py-2">
                                        <BrandedQRCode value={depositAddress} size={240} />
                                    </div>

                                    {/* Address */}
                                    <div className="mt-2">
                                        <label className="text-xs font-medium text-white/70 mb-1.5 block">Your deposit address</label>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono select-all truncate"
                                            >
                                                {depositAddress}
                                            </div>
                                            <button
                                                onClick={copyToClipboard}
                                                className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-400/30 transition-all text-xs font-medium text-white/70 hover:text-white whitespace-nowrap"
                                            >
                                                {copied ? (
                                                    <span className="text-emerald-400">Copied!</span>
                                                ) : (
                                                    <span>Copy</span>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Warning - Minimal */}
                                    <div className="rounded-lg bg-amber-500/10 p-2 border border-amber-400/20 mt-2">
                                        <p className="text-xs text-amber-200/90 leading-tight">
                                            <strong className="text-amber-300">⚠️</strong> Only send <strong className="text-white">{selectedNetworkData?.name}</strong> on <strong className="text-white">{selectedNetworkData?.chain}</strong>. Min amount is $1
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-red-400 font-medium">Failed to generate address</p>
                                    <p className="text-white/50 text-sm mt-1">Please try again or contact support</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Coming Soon for other methods */}
                    {selectedMethod && selectedMethod !== 'crypto' && (
                        <div className="text-center py-8">
                            <p className="text-zinc-400">This payment method is coming soon!</p>
                            <button
                                onClick={() => setSelectedMethod(null)}
                                className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                ← Back to payment methods
                            </button>
                        </div>
                    )}
                </div>

                {/* Status Overlays */}
                <AnimatePresence>
                    {depositStatus !== 'idle' && (
                        <motion.div
                            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
                            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            className="absolute inset-0 z-50 rounded-2xl flex items-center justify-center bg-black/60"
                        >
                            <div className="text-center p-6">
                                {depositStatus === 'detected' ? (
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="flex flex-col items-center"
                                    >
                                        <div className="relative mb-6">
                                            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                                            <div className="relative p-4 rounded-full bg-blue-500/20 border border-blue-400/50">
                                                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-2">Payment Detected</h3>
                                        <p className="text-blue-200/70 mb-1">Received ${detectedAmount.toFixed(2)} USDC</p>
                                        <p className="text-xs text-white/40">Waiting for network confirmation...</p>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="flex flex-col items-center"
                                    >
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                                            transition={{
                                                scale: { type: "spring", stiffness: 200, damping: 10 },
                                                rotate: { duration: 0.5, ease: "easeInOut" }
                                            }}
                                            className="relative mb-6"
                                        >
                                            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl" />
                                            <div className="relative p-4 rounded-full bg-emerald-500/20 border border-emerald-400/50">
                                                <Check className="w-8 h-8 text-emerald-400 stroke-[3]" />
                                            </div>
                                            {/* Simple particles */}
                                            {[...Array(6)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ opacity: 1, x: 0, y: 0 }}
                                                    animate={{ opacity: 0, x: Math.cos(i * 60 * Math.PI / 180) * 40, y: Math.sin(i * 60 * Math.PI / 180) * 40 }}
                                                    transition={{ duration: 0.8, delay: 0.2 }}
                                                    className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400"
                                                />
                                            ))}
                                        </motion.div>
                                        <h3 className="text-xl font-bold text-white mb-2">Payment Successful!</h3>
                                        <p className="text-emerald-200/70 mb-6">Added ${detectedAmount.toFixed(2)} to your balance.</p>

                                        <button
                                            onClick={() => {
                                                setDepositStatus('idle'); // Reset for next time if they want
                                                onClose(); // Or close modal
                                            }}
                                            className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors"
                                        >
                                            Start Trading
                                        </button>
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
