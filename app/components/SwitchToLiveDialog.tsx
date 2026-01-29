'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, DollarSign, TrendingDown, ShieldAlert } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface SwitchToLiveDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (dontShowAgain: boolean) => void;
    isSwitching: boolean;
}

export function SwitchToLiveDialog({ isOpen, onClose, onConfirm, isSwitching }: SwitchToLiveDialogProps) {
    const [mounted, setMounted] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const dialogContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999]"
                    />

                    {/* Dialog */}
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: "spring", duration: 0.3 }}
                            className="bg-[var(--surface-elevated)] border border-purple-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-b border-purple-500/30 p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-500/20 rounded-lg">
                                        <AlertTriangle className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Switch to Live Trading?</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">You'll be using real money</p>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    You're about to switch to live trading. Please understand the risks:
                                </p>
                                <ul className="space-y-2.5 text-sm text-gray-400">
                                    <li className="flex items-start gap-3">
                                        <div className="p-1 bg-red-500/20 rounded-lg mt-0.5">
                                            <DollarSign className="w-3.5 h-3.5 text-red-400" />
                                        </div>
                                        <div>
                                            <span className="text-white font-medium">Real money at stake</span>
                                            <p className="text-xs text-gray-500 mt-0.5">All trades use your actual balance</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="p-1 bg-purple-500/20 rounded-lg mt-0.5">
                                            <TrendingDown className="w-3.5 h-3.5 text-purple-400" />
                                        </div>
                                        <div>
                                            <span className="text-white font-medium">Risk of loss</span>
                                            <p className="text-xs text-gray-500 mt-0.5">You can lose your deposited funds</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="p-1 bg-blue-500/20 rounded-lg mt-0.5">
                                            <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                                        </div>
                                        <div>
                                            <span className="text-white font-medium">Trade responsibly</span>
                                            <p className="text-xs text-gray-500 mt-0.5">Only risk what you can afford to lose</p>
                                        </div>
                                    </li>
                                </ul>

                                <div className="bg-purple-500/10 border border-purple-400/30 rounded-lg p-3">
                                    <p className="text-xs text-purple-300">
                                        ⚠️ Prediction markets involve financial risk. Trade wisely and within your means.
                                    </p>
                                </div>

                                {/* Don't show again checkbox */}
                                <label className="flex items-center gap-2 cursor-pointer group pt-2">
                                    <div className="relative flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={dontShowAgain}
                                            onChange={(e) => setDontShowAgain(e.target.checked)}
                                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-600 focus:ring-purple-500 focus:ring-offset-0 transition-colors"
                                        />
                                    </div>
                                    <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                                        Don't show this confirmation again
                                    </span>
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 p-6 pt-0">
                                <button
                                    onClick={onClose}
                                    disabled={isSwitching}
                                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Stay in Demo
                                </button>
                                <motion.button
                                    onClick={() => onConfirm(dontShowAgain)}
                                    disabled={isSwitching}
                                    whileHover={{ scale: isSwitching ? 1 : 1.02 }}
                                    whileTap={{ scale: isSwitching ? 1 : 0.98 }}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSwitching ? (
                                        <>
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            >
                                                <AlertTriangle className="w-4 h-4" />
                                            </motion.div>
                                            Switching...
                                        </>
                                    ) : (
                                        <>
                                            I Understand, Go Live
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(dialogContent, document.body);
}
