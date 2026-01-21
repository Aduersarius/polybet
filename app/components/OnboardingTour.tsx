'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface OnboardingTourProps {
    isOpen: boolean;
    onClose: () => void;
}

const steps = [
    {
        title: 'Browse Markets',
        description: 'Explore prediction markets across sports, politics, crypto, and more. Use categories to filter or search for topics.',
        icon: '🎯',
        tip: 'Use the search bar to find specific events',
    },
    {
        title: 'Understand Odds',
        description: '70% YES means the market thinks there\'s a 70% chance it happens. Lower odds = higher potential profit.',
        icon: '📊',
        tip: 'Winning shares always pay exactly $1.00',
    },
    {
        title: 'Deposit Funds',
        description: 'Click "Deposit" to add funds via crypto (USDC on Polygon). Your balance appears instantly.',
        icon: '💰',
        tip: 'Minimum deposit is just $1',
    },
    {
        title: 'Place Your Trade',
        description: 'Buy YES if you think it will happen, NO if you don\'t. Use market or limit orders.',
        icon: '🎲',
        tip: 'Start small - you can trade as little as $0.10',
    },
    {
        title: 'Track Positions',
        description: 'View active bets in "My Bets". Sell anytime before the event ends to lock in profits.',
        icon: '📈',
        tip: 'Use favorites ❤️ to track markets you care about',
    },
    {
        title: 'Withdraw Winnings',
        description: 'When markets resolve, winning shares pay $1 each. Withdraw funds anytime to your wallet.',
        icon: '💸',
        tip: 'Requires 2FA for security',
    },
];

export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const totalSteps = steps.length;
    const step = steps[currentStep];

    const handleNext = () => {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleClose = () => {
        setCurrentStep(0);
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90]"
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    >
                        <div 
                            className="w-full max-w-sm bg-gradient-to-b from-[#1a1f2e] to-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="relative px-5 pt-5 pb-4">
                                {/* Close button */}
                                <button
                                    onClick={handleClose}
                                    className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                {/* Progress bar */}
                                <div className="flex items-center gap-1.5 mb-4">
                                    {steps.map((_, idx) => (
                                        <div
                                            key={idx}
                                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                                idx <= currentStep ? 'bg-blue-500' : 'bg-white/10'
                                            }`}
                                        />
                                    ))}
                                </div>

                                {/* Step counter */}
                                <div className="text-xs text-gray-400 mb-3">
                                    Step {currentStep + 1} of {totalSteps}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-5 pb-4">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={currentStep}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {/* Icon */}
                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-3xl mb-4">
                                            {step.icon}
                                        </div>

                                        {/* Title */}
                                        <h2 className="text-xl font-bold text-white mb-2">
                                            {step.title}
                                        </h2>

                                        {/* Description */}
                                        <p className="text-sm text-gray-300 leading-relaxed mb-4">
                                            {step.description}
                                        </p>

                                        {/* Tip */}
                                        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                            <span className="text-sm">💡</span>
                                            <p className="text-xs text-blue-200/90 leading-relaxed">
                                                {step.tip}
                                            </p>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Navigation */}
                            <div className="px-5 pb-5 pt-2">
                                <div className="flex items-center gap-3">
                                    {/* Back button */}
                                    {currentStep > 0 ? (
                                        <button
                                            onClick={handlePrev}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleClose}
                                            className="text-sm text-gray-400 hover:text-white transition-colors"
                                        >
                                            Skip
                                        </button>
                                    )}

                                    {/* Next/Finish button */}
                                    <button
                                        onClick={handleNext}
                                        className="flex-1 h-10 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                                    >
                                        {currentStep === totalSteps - 1 ? (
                                            'Start Trading'
                                        ) : (
                                            <>
                                                Next
                                                <ChevronRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
