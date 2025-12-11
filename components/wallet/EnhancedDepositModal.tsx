'use client';

import { useEffect, useState } from 'react';
import { X, Zap, CreditCard, Building2, Repeat, Wallet as WalletIcon, ChevronDown, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface EnhancedDepositModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBalanceUpdate?: () => void;
}

type PaymentMethod = 'crypto' | 'card' | 'sepa' | 'exchange' | 'paypal';
type CryptoNetwork = 'polygon-usdc' | 'ethereum-usdt' | 'bsc-usdt' | 'arbitrum-usdc';

const cryptoNetworks = [
    { id: 'polygon-usdc', name: 'USDC', chain: 'Polygon', icon: '🟣', fee: '1%' },
    { id: 'ethereum-usdt', name: 'USDT', chain: 'Ethereum', icon: '⟠', fee: '2%' },
    { id: 'bsc-usdt', name: 'USDT', chain: 'BSC', icon: '🟡', fee: '1.5%' },
    { id: 'arbitrum-usdc', name: 'USDC', chain: 'Arbitrum', icon: '🔵', fee: '0.5%' },
];

export function EnhancedDepositModal({ isOpen, onClose, onBalanceUpdate }: EnhancedDepositModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetwork>('polygon-usdc');
    const [depositAddress, setDepositAddress] = useState<string>('');
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

    const fetchBalance = async () => {
        try {
            const res = await fetch('/api/balance');
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
            const response = await fetch('/api/crypto/deposit');
            const data = await response.json();
            setDepositAddress(data.address);
        } catch (error) {
            console.error('Failed to fetch deposit address:', error);
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

    useEffect(() => {
        if (isOpen) {
            fetchBalance();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const selectedNetworkData = cryptoNetworks.find(n => n.id === selectedNetwork);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-6 bg-[#1a1d2e] border border-white/10 rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Deposit</h2>
                        <p className="text-sm text-zinc-400">
                            PolyBet Balance: {balance !== null ? `$${balance.toFixed(2)}` : '—'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {/* Payment Methods */}
                {!selectedMethod && (
                    <div className="space-y-3">
                        {/* Crypto */}
                        <button
                            onClick={() => handleMethodSelect('crypto')}
                            className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/20">
                                        <Zap className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">Transfer Crypto</p>
                                        <p className="text-sm text-zinc-400">No limit • Instant</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    {['🟣', '⟠', '🟡', '🔵'].map((icon, i) => (
                                        <span key={i} className="text-lg">{icon}</span>
                                    ))}
                                </div>
                            </div>
                        </button>

                        {/* Card */}
                        <button
                            onClick={() => handleMethodSelect('card')}
                            className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left opacity-60 cursor-not-allowed"
                            disabled
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-purple-500/20">
                                        <CreditCard className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">Deposit with Card</p>
                                        <p className="text-sm text-zinc-400">$50,000 • 5 min</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <span className="text-sm">💳</span>
                                </div>
                            </div>
                        </button>

                        {/* SEPA */}
                        <button
                            onClick={() => handleMethodSelect('sepa')}
                            className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left opacity-60 cursor-not-allowed"
                            disabled
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-green-500/20">
                                        <Building2 className="w-5 h-5 text-green-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">Deposit with SEPA</p>
                                        <p className="text-sm text-zinc-400">No limit • 1-2 business days</p>
                                    </div>
                                </div>
                            </div>
                        </button>

                        {/* Exchange */}
                        <button
                            onClick={() => handleMethodSelect('exchange')}
                            className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left opacity-60 cursor-not-allowed"
                            disabled
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-yellow-500/20">
                                        <Repeat className="w-5 h-5 text-yellow-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">Connect Exchange</p>
                                        <p className="text-sm text-zinc-400">No limit • 2 min</p>
                                    </div>
                                </div>
                            </div>
                        </button>

                        {/* PayPal */}
                        <button
                            onClick={() => handleMethodSelect('paypal')}
                            className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left opacity-60 cursor-not-allowed"
                            disabled
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-400/20">
                                        <WalletIcon className="w-5 h-5 text-blue-300" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">Deposit with PayPal</p>
                                        <p className="text-sm text-zinc-400">$10,000 • 6 min</p>
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {/* Crypto Details */}
                {selectedMethod === 'crypto' && (
                    <div className="space-y-4">
                        {/* Back Button */}
                        <button
                            onClick={() => setSelectedMethod(null)}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            ← Back to payment methods
                        </button>

                        {/* Network Selector */}
                        <div className="relative">
                            <label className="block text-sm text-zinc-400 mb-2">Select Network</label>
                            <button
                                onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white flex items-center justify-between hover:bg-white/10 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{selectedNetworkData?.icon}</span>
                                    <span>{selectedNetworkData?.name}</span>
                                    <span className="text-zinc-400 text-sm">({selectedNetworkData?.chain})</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 transition-transform ${showNetworkDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showNetworkDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1d2e] border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden">
                                    {cryptoNetworks.map((network) => (
                                        <button
                                            key={network.id}
                                            onClick={() => handleNetworkChange(network.id as CryptoNetwork)}
                                            className="w-full p-3 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{network.icon}</span>
                                                <div>
                                                    <p className="text-white text-sm">{network.name} ({network.chain})</p>
                                                    <p className="text-xs text-zinc-400">Fee: {network.fee}</p>
                                                </div>
                                            </div>
                                            {selectedNetwork === network.id && (
                                                <Check className="w-4 h-4 text-green-400" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* QR Code & Address */}
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                            </div>
                        ) : depositAddress ? (
                            <>
                                {/* QR Code */}
                                <div className="flex justify-center p-4 bg-white rounded-xl">
                                    <QRCodeSVG value={depositAddress} size={200} />
                                </div>

                                {/* Address */}
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">Deposit Address</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={depositAddress}
                                            readOnly
                                            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-mono"
                                        />
                                        <button
                                            onClick={copyToClipboard}
                                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
                                        >
                                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Warning */}
                                <div className="rounded-lg bg-yellow-500/10 p-4 border border-yellow-500/20">
                                    <p className="text-sm text-yellow-400">
                                        <strong>⚠️ Important:</strong> Only send <strong>{selectedNetworkData?.name}</strong> on the <strong>{selectedNetworkData?.chain}</strong> network to this address. Sending other assets or using other networks may result in permanent loss.
                                    </p>
                                </div>

                                {/* Fee Info */}
                                <div className="text-xs text-zinc-400 text-center">
                                    Processing fee: {selectedNetworkData?.fee} • Automatic processing every 60 seconds
                                </div>
                            </>
                        ) : (
                            <p className="text-center text-red-400">Failed to generate address. Please try again.</p>
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
        </div>
    );
}
