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
        title: '🎯 Browse Markets',
        description: 'Explore various prediction markets across sports, politics, crypto, and more. Use categories to filter events or search for specific topics.',
        icon: '🎯',
    },
    {
        title: '📊 Understand Odds',
        description: 'Odds show market confidence. 70% YES means the market thinks there\'s a 70% chance it happens. Lower odds = higher potential profit if you\'re right.',
        icon: '📊',
    },
    {
        title: '💰 Deposit Funds',
        description: 'Click "Deposit" to add funds via crypto (USDC on Polygon). Your balance appears instantly and you can start trading.',
        icon: '💰',
    },
    {
        title: '🎲 Place Your Trade',
        description: 'Buy YES if you think it will happen, NO if you don\'t. Enter your amount ($0.10-$10,000) and confirm. You can use market or limit orders.',
        icon: '🎲',
    },
    {
        title: '📈 Track Your Positions',
        description: 'View your active bets in "My Bets". Watch odds change in real-time. Sell anytime before the event ends to lock in profits or cut losses.',
        icon: '📈',
    },
    {
        title: '💸 Withdraw Winnings',
        description: 'When markets resolve, winning shares pay $1 each. Withdraw funds anytime to your Polygon wallet (requires 2FA and at least 1 bet placed).',
        icon: '💸',
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
                        className="fixed inset-0 z-[100] flex items-center justify-center px-2 sm:px-4 py-3 sm:py-4"
                    >
                        <div className="w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] bg-[#0f1117] border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                            <div className="grid md:grid-cols-2 gap-0 flex-1 overflow-hidden">
                                <div className="relative bg-gradient-to-br from-blue-700/40 via-purple-700/30 to-black p-3 sm:p-6 md:p-8 flex flex-col justify-between overflow-hidden">
                                    <div className="space-y-1.5 sm:space-y-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[9px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] text-blue-200/80">Get started</p>
                                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 text-[11px] text-blue-100">
                                                <span>Get started</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h.008v.008h-.008v-.008ZM12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-.75-9.75h1.5v4.5h-1.5v-4.5Zm0-3h1.5v1.5h-1.5v-1.5Z" />
                                                </svg>
                                            </div>
                                        </div>
                                        <h2 className="text-lg sm:text-2xl md:text-3xl font-bold text-white leading-tight">Welcome to Polybet!</h2>
                                        <p className="text-[11px] sm:text-sm text-blue-100/90 max-w-md leading-snug">
                                            Learn how to trade on prediction markets in 6 simple steps.
                                        </p>
                                    </div>
                                    <div className="hidden md:block rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-blue-50/90 mt-4 space-y-2">
                                        <p className="font-semibold">💡 Quick Tips:</p>
                                        <ul className="space-y-1 text-blue-100/80">
                                            <li>• Odds move with demand - prices change as traders buy/sell</li>
                                            <li>• You can sell anytime before an event ends</li>
                                            <li>• Winning shares always pay exactly $1.00</li>
                                            <li>• Use favorites ❤️ to track markets you care about</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="bg-[#0a0c12] p-3 sm:p-6 md:p-8 space-y-2 sm:space-y-4 flex flex-col overflow-hidden">
                                    <div className="space-y-1.5 sm:space-y-3 overflow-y-auto custom-scrollbar pr-1 sm:pr-2 flex-1">
                                        {content.map((step, idx) => (
                                            <div key={step.title} className="flex gap-2 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-white/5 bg-white/5 hover:border-blue-500/30 transition-colors group">
                                                <div className="flex-shrink-0 w-5 h-5 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white font-semibold flex items-center justify-center text-[10px] sm:text-sm group-hover:scale-110 transition-transform">
                                                    {idx + 1}
                                                </div>
                                                <div className="space-y-0.5 min-w-0">
                                                    <h3 className="text-xs sm:text-base font-semibold text-white leading-tight">{step.title}</h3>
                                                    <p className="text-[10px] sm:text-xs text-gray-300 leading-snug">{step.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-[9px] sm:text-xs text-center text-gray-400">
                                        💡 Restart this tour anytime
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={onClose}
                                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] sm:text-sm font-medium transition-colors"
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





