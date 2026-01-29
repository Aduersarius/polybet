import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, Wallet, History, Briefcase, TrendingUp, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ResetDemoDialog } from './ResetDemoDialog';
import { SwitchToDemoDialog } from './SwitchToDemoDialog';
import { SwitchToLiveDialog } from './SwitchToLiveDialog';

interface BalanceDropdownProps {
    balance: number;
    accountMode?: 'DEMO' | 'LIVE';
}

export function BalanceDropdown({ balance, accountMode: propAccountMode }: BalanceDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [accountMode, setAccountMode] = useState<'DEMO' | 'LIVE'>(propAccountMode || 'LIVE');
    const [isToggling, setIsToggling] = useState(false);
    const [showResetDialog, setShowResetDialog] = useState(false);
    const [showSwitchToDemoDialog, setShowSwitchToDemoDialog] = useState(false);
    const [showSwitchToLiveDialog, setShowSwitchToLiveDialog] = useState(false);
    const displayBalance = Number.isFinite(Number(balance)) ? Number(balance) : 0;
    const queryClient = useQueryClient();

    // Fetch current account mode on mount
    useEffect(() => {
        fetch('/api/balance')
            .then(res => res.json())
            .then(data => {
                if (data.accountMode) {
                    setAccountMode(data.accountMode);
                }
            })
            .catch(err => console.error('Failed to fetch account mode:', err));
    }, []);

    // Sync local state when prop changes (e.g., from banner switching modes)
    useEffect(() => {
        if (propAccountMode && propAccountMode !== accountMode) {
            setAccountMode(propAccountMode);
        }
    }, [propAccountMode, accountMode]); // Include accountMode to satisfy linter


    // Show appropriate confirmation dialog
    const showModeDialog = () => {
        if (accountMode === 'DEMO') {
            const skip = typeof window !== 'undefined' ? localStorage.getItem('skipModeConfirmation_LIVE') : null;
            if (skip === 'true') {
                toggleAccountMode(false);
            } else {
                setShowSwitchToLiveDialog(true);
            }
        } else {
            const skip = typeof window !== 'undefined' ? localStorage.getItem('skipModeConfirmation_DEMO') : null;
            if (skip === 'true') {
                toggleAccountMode(false);
            } else {
                setShowSwitchToDemoDialog(true);
            }
        }
    };

    // Actual mode switching logic (called from dialog confirmation)
    const toggleAccountMode = async (dontShowAgain: boolean = false) => {
        const newMode = accountMode === 'DEMO' ? 'LIVE' : 'DEMO';
        setIsToggling(true);

        // Save preference if checked
        if (dontShowAgain && typeof window !== 'undefined') {
            localStorage.setItem(`skipModeConfirmation_${newMode}`, 'true');
        }

        try {
            const response = await fetch('/api/account/toggle-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: newMode })
            });

            const data = await response.json();

            if (data.success) {
                setAccountMode(newMode);

                // Invalidate queries to refetch fresh data
                await queryClient.invalidateQueries({ queryKey: ['balance'] });
                await queryClient.invalidateQueries({ queryKey: ['userBalance'] });

                // Close dialogs and dropdown
                setShowSwitchToDemoDialog(false);
                setShowSwitchToLiveDialog(false);
                setTimeout(() => setIsOpen(false), 300);
            } else {
                console.error('Failed to toggle mode:', data.error);
            }
        } catch (error) {
            console.error('Error toggling mode:', error);
        } finally {
            setIsToggling(false);
        }
    };

    const resetDemoAccount = async () => {
        setIsToggling(true);

        try {
            const response = await fetch('/api/account/reset-demo', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                // Invalidate queries to refetch fresh data
                await queryClient.invalidateQueries({ queryKey: ['balance'] });
                await queryClient.invalidateQueries({ queryKey: ['userBalance'] });

                setShowResetDialog(false);
                setTimeout(() => setIsOpen(false), 300);
            } else {
                console.error('Failed to reset demo:', data.error);
            }
        } catch (error) {
            console.error('Error resetting demo:', error);
        } finally {
            setIsToggling(false);
        }
    };

    return (
        <div className="relative">
            <motion.button
                key={`${accountMode}-${displayBalance}`} // Re-animate when mode or balance changes
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={() => setIsOpen(!isOpen)}
                className="hidden md:flex flex-col items-end mr-2 hover:bg-white/5 rounded-lg px-3 py-2 transition-colors group"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                        ${displayBalance.toFixed(2)}
                        {accountMode === 'DEMO' && <span className="ml-1.5 text-xs text-blue-400">DEMO</span>}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </motion.button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown Menu */}
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute right-0 mt-1 w-64 bg-[var(--surface-elevated)] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
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

                        {/* Mode Toggle Button */}
                        <div className="p-2 border-b border-white/5">
                            <motion.button
                                onClick={showModeDialog}
                                disabled={isToggling}
                                whileHover={{ scale: isToggling ? 1 : 1.02 }}
                                whileTap={{ scale: isToggling ? 1 : 0.98 }}
                                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${accountMode === 'DEMO'
                                    ? 'bg-green-500/10 hover:bg-green-500/20 text-green-300'
                                    : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300'
                                    } disabled:opacity-50`}
                            >
                                <div className="flex items-center gap-2">
                                    <motion.div
                                        animate={{ rotate: isToggling ? 360 : 0 }}
                                        transition={{ duration: 0.6, repeat: isToggling ? Infinity : 0, ease: "linear" }}
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </motion.div>
                                    <span className="font-medium">
                                        {isToggling
                                            ? 'Switching...'
                                            : accountMode === 'DEMO' ? 'Switch to Live' : 'Switch to Demo'
                                        }
                                    </span>
                                </div>
                                {accountMode === 'DEMO' && !isToggling && <span className="text-xs text-gray-500">$10k virtual</span>}
                            </motion.button>

                            {/* Reset Demo Button */}
                            {accountMode === 'DEMO' && (
                                <button
                                    onClick={() => setShowResetDialog(true)}
                                    disabled={isToggling}
                                    className="w-full mt-1.5 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors bg-red-500/10 hover:bg-red-500/20 text-red-300 disabled:opacity-50"
                                >
                                    Reset Demo Account
                                </button>
                            )}
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
                    </motion.div>
                </>
            )}

            {/* Reset Demo Dialog */}
            <ResetDemoDialog
                isOpen={showResetDialog}
                onClose={() => setShowResetDialog(false)}
                onConfirm={resetDemoAccount}
                isResetting={isToggling}
            />

            {/* Switch to Demo Dialog */}
            <SwitchToDemoDialog
                isOpen={showSwitchToDemoDialog}
                onClose={() => setShowSwitchToDemoDialog(false)}
                onConfirm={toggleAccountMode}
                isSwitching={isToggling}
            />

            {/* Switch to Live Dialog */}
            <SwitchToLiveDialog
                isOpen={showSwitchToLiveDialog}
                onClose={() => setShowSwitchToLiveDialog(false)}
                onConfirm={toggleAccountMode}
                isSwitching={isToggling}
            />
        </div>
    );
}
