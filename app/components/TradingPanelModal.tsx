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
        // Refresh the page or invalidate queries after successful trade
        window.location.reload();
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
                            className="w-full max-w-md bg-[#121212] rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
                        >
                            {/* Header */}
                            <div className="bg-[#121212] border-b border-white/10 p-4 flex items-center justify-between shrink-0">
                                <div className="flex-1 pr-4">
                                    <h2 className="text-lg font-bold text-white line-clamp-2">{eventTitle}</h2>
                                    <p className="text-xs text-gray-400 mt-1">Place your bet</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                                >
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Trading Panel Content */}
                            <div className="p-4 overflow-y-auto">
                                <TradingPanel
                                    eventId={eventId}
                                    creationDate={creationDate}
                                    resolutionDate={resolutionDate}
                                    onTrade={handleTrade}
                                    preselectedOption={preselectedOption}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
