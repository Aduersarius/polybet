'use client';

import { useState } from 'react';
import { OnboardingTour } from './OnboardingTour';

export function OnboardingLauncher() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed right-4 z-50 lg:hidden inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-[#bb86fc] via-[#8b5cf6] to-[#03dac6] text-white shadow-lg shadow-black/30 border border-white/15 active:scale-95 transition-transform"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
                aria-label="Getting started tour"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
            </button>
            <OnboardingTour isOpen={open} onClose={() => setOpen(false)} />
        </>
    );
}

