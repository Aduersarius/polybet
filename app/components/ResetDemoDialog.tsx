'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface ResetDemoDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isResetting: boolean;
}

export function ResetDemoDialog({ isOpen, onClose, onConfirm, isResetting }: ResetDemoDialogProps) {
    const [mounted, setMounted] = useState(false);

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
                            className="bg-[var(--surface-elevated)] border border-red-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border-b border-red-500/30 p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-500/20 rounded-lg">
                                        <AlertTriangle className="w-6 h-6 text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Reset Demo Account?</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone</p>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    This will permanently:
                                </p>
                                <ul className="space-y-2 text-sm text-gray-400">
                                    <li className="flex items-start gap-2">
                                        <span className="text-red-400 mt-0.5">•</span>
                                        <span>Cancel all open demo orders</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-red-400 mt-0.5">•</span>
                                        <span>Delete all demo positions and balances</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-red-400 mt-0.5">•</span>
                                        <span>Clear demo trading history</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-400 mt-0.5">✓</span>
                                        <span>Reset your balance to <strong className="text-white">$10,000</strong></span>
                                    </li>
                                </ul>

                                <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-3">
                                    <p className="text-xs text-blue-300">
                                        💡 Your live account and balances will not be affected
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 p-6 pt-0">
                                <button
                                    onClick={onClose}
                                    disabled={isResetting}
                                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <motion.button
                                    onClick={onConfirm}
                                    disabled={isResetting}
                                    whileHover={{ scale: isResetting ? 1 : 1.02 }}
                                    whileTap={{ scale: isResetting ? 1 : 0.98 }}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isResetting ? (
                                        <>
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </motion.div>
                                            Resetting...
                                        </>
                                    ) : (
                                        <>
                                            <RotateCcw className="w-4 h-4" />
                                            Reset Account
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
