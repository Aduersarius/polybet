'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, Shield, TrendingUp, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface SwitchToDemoDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (dontShowAgain: boolean) => void;
    isSwitching: boolean;
}

export function SwitchToDemoDialog({ isOpen, onClose, onConfirm, isSwitching }: SwitchToDemoDialogProps) {
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
                            className="bg-[var(--surface-elevated)] border border-blue-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-b border-blue-500/30 p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/20 rounded-lg">
                                        <Gamepad2 className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Switch to Demo Mode?</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">Practice trading with zero risk</p>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    Demo mode lets you practice trading without any financial risk:
                                </p>
                                <ul className="space-y-2.5 text-sm text-gray-400">
                                    <li className="flex items-start gap-3">
                                        <div className="p-1 bg-green-500/20 rounded-lg mt-0.5">
                                            <Shield className="w-3.5 h-3.5 text-green-400" />
                                        </div>
                                        <div>
                                            <span className="text-white font-medium">$10,000 virtual balance</span>
                                            <p className="text-xs text-gray-500 mt-0.5">No real money at risk</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="p-1 bg-blue-500/20 rounded-lg mt-0.5">
                                            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                        </div>
                                        <div>
                                            <span className="text-white font-medium">Full trading experience</span>
                                            <p className="text-xs text-gray-500 mt-0.5">Real markets, simulated trades</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="p-1 bg-purple-500/20 rounded-lg mt-0.5">
                                            <Zap className="w-3.5 h-3.5 text-purple-400" />
                                        </div>
                                        <div>
                                            <span className="text-white font-medium">Switch back anytime</span>
                                            <p className="text-xs text-gray-500 mt-0.5">Your live balance stays safe</p>
                                        </div>
                                    </li>
                                </ul>

                                <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-3">
                                    <p className="text-xs text-blue-300">
                                        💡 Your live account balance and positions remain untouched
                                    </p>
                                </div>

                                {/* Don't show again checkbox */}
                                <label className="flex items-center gap-2 cursor-pointer group pt-2">
                                    <div className="relative flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={dontShowAgain}
                                            onChange={(e) => setDontShowAgain(e.target.checked)}
                                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 transition-colors"
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
                                    Cancel
                                </button>
                                <motion.button
                                    onClick={() => onConfirm(dontShowAgain)}
                                    disabled={isSwitching}
                                    whileHover={{ scale: isSwitching ? 1 : 1.02 }}
                                    whileTap={{ scale: isSwitching ? 1 : 0.98 }}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSwitching ? (
                                        <>
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            >
                                                <Gamepad2 className="w-4 h-4" />
                                            </motion.div>
                                            Switching...
                                        </>
                                    ) : (
                                        <>
                                            <Gamepad2 className="w-4 h-4" />
                                            Start Demo Mode
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
