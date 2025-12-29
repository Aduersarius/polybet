'use client';

import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { useCallback } from 'react';

export function Footer() {
    const openFeedback = useCallback(async () => {
        const feedback = Sentry.getFeedback();
        if (feedback) {
            await feedback.createForm().then((form) => {
                form.appendToDom();
                form.open();
            });
        }
    }, []);

    return (
        <footer className="border-t border-white/10 bg-gray-800 mt-auto relative z-50 pointer-events-auto">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-gray-400">
                    <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                        <Link prefetch href="/faq" className="hover:text-white transition-colors">FAQ</Link>
                        <span className="text-gray-600">•</span>
                        <Link prefetch href="/legal/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link>
                        <span className="text-gray-600">•</span>
                        <Link prefetch href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <span className="text-gray-600">•</span>
                        <Link prefetch href="/legal/terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
                        <span className="text-gray-600">•</span>
                        <Link prefetch href="/legal/risk-warning" className="hover:text-white transition-colors">Risk Warning</Link>
                        <span className="text-gray-600">•</span>
                        <button
                            onClick={openFeedback}
                            className="hover:text-white transition-colors inline-flex items-center gap-1 group"
                        >
                            <svg
                                className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                            </svg>
                            Feedback
                        </button>
                    </div>
                    <div className="text-[10px] text-gray-500 text-center">
                        © 2025 PolyBet. All rights reserved.
                    </div>
                </div>
            </div>
        </footer>
    );
}
