import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Wallet, History, Briefcase, TrendingUp } from 'lucide-react';

interface BalanceDropdownProps {
    balance: number;
}

export function BalanceDropdown({ balance }: BalanceDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const displayBalance = Number.isFinite(Number(balance)) ? Number(balance) : 0;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="hidden md:flex flex-col items-end mr-2 hover:bg-white/5 rounded-lg px-3 py-2 transition-colors group"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">${displayBalance.toFixed(2)}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-1 w-64 bg-[var(--surface-elevated)] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                        {/* Balance Header */}
                        <div className="p-4 bg-gradient-to-r from-[var(--primary)]/10 to-[var(--accent)]/10 border-b border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-[var(--primary)]/20">
                                        <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                                    </div>
                                    <span className="text-sm text-gray-400">Balance</span>
                                </div>
                                <span className="text-xl font-bold text-white">${displayBalance.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="py-1">
                            <Link
                                href="/profile"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                <div className="p-1.5 rounded-lg bg-[var(--accent)]/10">
                                    <Briefcase className="w-4 h-4 text-[var(--accent)]" />
                                </div>
                                <div>
                                    <div className="font-medium">Portfolio</div>
                                    <div className="text-xs text-gray-500">Open positions & PnL</div>
                                </div>
                            </Link>

                            <Link
                                href="/withdraw"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                <div className="p-1.5 rounded-lg bg-[var(--secondary)]/10">
                                    <Wallet className="w-4 h-4 text-[var(--secondary)]" />
                                </div>
                                <div>
                                    <div className="font-medium">Withdraw</div>
                                    <div className="text-xs text-gray-500">Request crypto withdrawal</div>
                                </div>
                            </Link>

                            <Link
                                href="/transactions"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                <div className="p-1.5 rounded-lg bg-[var(--primary)]/10">
                                    <History className="w-4 h-4 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <div className="font-medium">Transaction History</div>
                                    <div className="text-xs text-gray-500">View deposits & withdrawals</div>
                                </div>
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

