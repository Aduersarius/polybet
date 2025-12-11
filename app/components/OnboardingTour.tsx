'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface OnboardingTourProps {
    isOpen: boolean;
    onClose: () => void;
}

const steps = [
    {
        title: 'Pick a market',
        description: `Buy 'Yes' or 'No' shares based on your view. Shares track live odds that update in real time as traders place bets.`,
    },
    {
        title: 'Make a prediction',
        description: 'Top up with crypto quickly and safely, then place your prediction on the outcome you believe in.',
    },
    {
        title: 'Get profit',
        description: 'Sell your shares anytime or hold to settlement—if your call is right, you keep the profits.',
    },
];

export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
    const content = useMemo(() => steps, []);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.9 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center px-3 sm:px-4"
                    >
                        <div className="w-full max-w-4xl bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="grid md:grid-cols-2 gap-0">
                                <div className="relative bg-gradient-to-br from-blue-700/40 via-purple-700/30 to-black p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-blue-200/80">Get started</p>
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 text-[11px] text-blue-100">
                                                <span>Get started</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h.008v.008h-.008v-.008ZM12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-.75-9.75h1.5v4.5h-1.5v-4.5Zm0-3h1.5v1.5h-1.5v-1.5Z" />
                                                </svg>
                                            </div>
                                        </div>
                                        <h2 className="text-3xl sm:text-3xl font-bold text-white leading-tight">Trade what you believe</h2>
                                        <p className="text-sm text-blue-100/90 max-w-md">
                                            Learn how PolyBet works in three simple steps. You can close this anytime and return later.
                                        </p>
                                    </div>
                                    <div className="hidden md:block rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-blue-50/90 mt-6">
                                        Odds move with demand. When more traders buy “Yes”, the price rises; when they buy “No”, the price falls.
                                    </div>
                                </div>
                                <div className="bg-[#0a0c12] p-6 sm:p-8 space-y-4">
                                    <div className="space-y-3">
                                        {content.map((step, idx) => (
                                            <div key={step.title} className="flex gap-4 p-4 rounded-xl border border-white/5 bg-white/5 hover:border-blue-500/50 transition-colors">
                                                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white font-semibold flex items-center justify-center">
                                                    {idx + 1}
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                                                    <p className="text-sm text-gray-300 leading-relaxed">{step.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={onClose}
                                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                                        >
                                            Start trading
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}



