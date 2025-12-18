'use client';

import { useState, useEffect } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import { TourModal } from '@/components/tour/TourModal';

export function OnboardingLauncher() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isPulsing, setIsPulsing] = useState(true);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleOpen = () => {
        setOpen(true);
        setIsPulsing(false);
    };

    const handleClose = () => {
        setOpen(false);
    };

    if (!mounted) return null;

    return (
        <>
            {/* Mobile Help Button */}
            <button
                type="button"
                onClick={handleOpen}
                className="group fixed bottom-6 right-5 z-50 lg:hidden inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 text-white shadow-xl shadow-blue-500/30 border border-white/20 hover:scale-110 active:scale-95 transition-all duration-300 overflow-hidden"
                aria-label="Get started with Polybet"
            >
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Pulsing ring effect */}
                {isPulsing && (
                    <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-75" />
                )}
                
                {/* Icon with sparkle */}
                <div className="relative">
                    <HelpCircle className="w-6 h-6 relative z-10" strokeWidth={2.5} />
                    <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-yellow-300 animate-pulse" />
                </div>
            </button>

            {/* Tour Modal */}
            <TourModal 
                isOpen={open} 
                onClose={handleClose}
                onComplete={handleClose}
            />
        </>
    );
}

