import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Wallet, History } from 'lucide-react';

interface BalanceDropdownProps {
    balance: number;
}

export function BalanceDropdown({ balance }: BalanceDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="hidden md:flex flex-col items-end mr-2 hover:bg-white/5 rounded-lg px-3 py-2 transition-colors group"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">${balance.toFixed(2)}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
                <span className="text-xs text-gray-400">Balance</span>
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-1 w-56 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl z-50">
                        <div className="p-3 border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">Balance</span>
                                <span className="text-lg font-bold text-white">${balance.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="py-1">
                            <Link
                                href="/withdraw"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                <Wallet className="w-4 h-4 text-green-400" />
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
                                <History className="w-4 h-4 text-blue-400" />
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