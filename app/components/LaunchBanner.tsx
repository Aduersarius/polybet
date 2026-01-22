'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Rocket } from 'lucide-react';

export function LaunchBanner() {
    const [isDismissed, setIsDismissed] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if banner was previously dismissed
        if (typeof window !== 'undefined') {
            const dismissed = localStorage.getItem('launchBannerDismissed');
            if (dismissed === 'true') {
                setIsDismissed(true);
                document.body.removeAttribute('data-banner-visible');
                return;
            }
        }

        // Show after a small delay for smooth animation
        const timer = setTimeout(() => {
            setIsVisible(true);
            if (typeof window !== 'undefined') {
                document.body.setAttribute('data-banner-visible', 'true');
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            if (typeof window !== 'undefined') {
                document.body.removeAttribute('data-banner-visible');
            }
        };
    }, []);

    const handleDismiss = () => {
        setIsDismissed(true);
        if (typeof window !== 'undefined') {
            localStorage.setItem('launchBannerDismissed', 'true');
            document.body.removeAttribute('data-banner-visible');
        }
    };

    if (isDismissed) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed top-0 left-0 right-0 z-[100] bg-[#1a1d28] border-b border-white/5 backdrop-blur-xl"
                    style={{ marginBottom: 0 }}
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                        <div className="flex items-center justify-between gap-4">
                            {/* Left: Icon and Message */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center">
                                        <Rocket className="w-4 h-4 text-blue-400" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white/90 leading-relaxed">
                                        <span className="font-semibold text-white">Launching Soon:</span> Pariflow is preparing for launch. Trading is not available at this time. User deposits are secure and you can request a withdrawal anytime. If you have any questions, please create a support ticket.
                                    </p>
                                </div>
                            </div>

                            {/* Right: Close Button */}
                            <button
                                onClick={handleDismiss}
                                className="flex-shrink-0 p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                aria-label="Dismiss banner"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
