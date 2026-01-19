'use client';

import { useState, useEffect } from 'react';
import { email } from '@/lib/auth-client';

interface EmailVerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    userEmail: string;
}

export function EmailVerificationModal({ isOpen, onClose, userEmail }: EmailVerificationModalProps) {
    const [resending, setResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // Handle Enter key to close modal
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleResend = async () => {
        if (cooldown > 0 || resending) return;

        setResending(true);
        setResendSuccess(false);

        try {
            const { error } = await email.sendVerificationEmail();

            if (error) {
                console.error('Failed to resend verification email:', error);
            } else {
                setResendSuccess(true);
                setCooldown(60); // 60 second cooldown

                // Countdown timer
                const interval = setInterval(() => {
                    setCooldown((prev) => {
                        if (prev <= 1) {
                            clearInterval(interval);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }
        } catch (err) {
            console.error('Error resending verification email:', err);
        } finally {
            setResending(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-4"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-md mx-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glassmorphism card with gradient border */}
                <div className="relative p-6 bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10">
                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 rounded-2xl pointer-events-none" />
                    
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-10 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="relative">
                        {/* Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                        </div>

                        {/* Header */}
                        <div className="mb-6 text-center">
                            <h2 className="text-2xl font-bold text-white mb-2">
                                Check Your Email
                            </h2>
                            <p className="text-white/60 text-sm">
                                We've sent a verification email to
                            </p>
                            <p className="text-white font-medium mt-1">
                                {userEmail}
                            </p>
                        </div>

                        {/* Important Notice */}
                        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div className="flex-1">
                                    <p className="text-amber-300 font-semibold text-sm mb-1">
                                        Email Verification Required
                                    </p>
                                    <p className="text-amber-200/70 text-xs leading-relaxed">
                                        You must verify your email before you can deposit funds or place trades.
                                        Please check your inbox and click the verification link.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="mb-6 space-y-2 text-sm text-white/60">
                            <p className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Click the verification link in the email
                            </p>
                            <p className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Check your spam folder if you don't see it
                            </p>
                            <p className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Verification link expires in 24 hours
                            </p>
                        </div>

                        {/* Resend Email */}
                        <div className="mb-6">
                            <p className="text-white/50 text-sm mb-3 text-center">
                                Didn't receive the email?
                            </p>
                            <button
                                onClick={handleResend}
                                disabled={resending || cooldown > 0}
                                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl transition-colors border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                                {resending
                                    ? 'Sending...'
                                    : cooldown > 0
                                        ? `Resend in ${cooldown}s`
                                        : resendSuccess
                                            ? 'Email Sent! ✓'
                                            : 'Resend Verification Email'}
                            </button>
                            {resendSuccess && cooldown === 0 && (
                                <p className="text-emerald-400 text-xs text-center mt-2">
                                    Verification email sent! Check your inbox.
                                </p>
                            )}
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
                        >
                            Got it, I'll check my email
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}


