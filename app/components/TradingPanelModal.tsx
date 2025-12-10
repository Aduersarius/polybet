'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TradingPanel } from './TradingPanel';

interface TradingPanelModalProps {
    isOpen: boolean;
    onClose: () => void;
    eventId: string;
    eventTitle: string;
    creationDate?: string;
    resolutionDate?: string;
    preselectedOption?: 'YES' | 'NO';
}

export function TradingPanelModal({
    isOpen,
    onClose,
    eventId,
    eventTitle,
    creationDate,
    resolutionDate,
    preselectedOption
}: TradingPanelModalProps) {
    const [selectedOption, setSelectedOption] = useState<'YES' | 'NO'>(preselectedOption || 'YES');

    const handleTrade = (type: 'YES' | 'NO', amount: number) => {
        // Close modal after successful trade
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        {/* Modal Panel - Center */}
                        <motion.div
                            initial={{ opacity: 0, y: 100, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 100, scale: 0.9 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-xl bg-gradient-to-b from-[#111111]/95 via-[#0b0b0b]/95 to-[#0a0a0a]/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
                        >
                            {/* Header */}
                            <div className="border-b border-white/10 px-5 py-4 flex items-start justify-between gap-4 shrink-0">
                                <div className="flex-1 pr-2 space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10">
                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        Live market
                                    </div>
                                    <h2 className="text-2xl font-semibold text-white leading-tight">{eventTitle}</h2>
                                    <p className="text-xs text-gray-400">
                                        Place your order with a streamlined, focused ticket.
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                                    aria-label="Close trading modal"
                                >
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Trading Panel Content */}
                            <div className="flex-1 overflow-y-auto min-h-0">
                                <TradingPanel
                                    eventId={eventId}
                                    creationDate={creationDate}
                                    resolutionDate={resolutionDate}
                                    onTrade={handleTrade}
                                    preselectedOption={preselectedOption}
                                    variant="modal"
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
