'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { email } from '@/lib/auth-client';

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBackToLogin: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose, onBackToLogin }: ForgotPasswordModalProps) {
    const [emailAddr, setEmailAddr] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    useEffect(() => {
        if (cooldown <= 0) return;
        const interval = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(interval);
    }, [cooldown]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cooldown > 0) {
            setErrorMessage(`Please wait ${cooldown}s before requesting another email.`);
            setStatus('error');
            return;
        }
        setStatus('loading');
        setErrorMessage('');

        try {
            const { error } = await email.forgetPassword(emailAddr, '/reset-password');

            if (error) {
                setErrorMessage(error.message || 'Failed to send reset email');
                setStatus('error');
            } else {
                setStatus('success');
                setCooldown(60);
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'An unexpected error occurred');
            setStatus('error');
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-4"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-md mx-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glassmorphism card with gradient border */}
                <div className="relative p-6 bg-surface border border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl">
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

                    {status === 'success' ? (
                        <div className="relative text-center py-4">
                            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
                            <p className="text-white/60 mb-8 text-sm">
                                We've sent a password reset link to <span className="text-white font-medium">{emailAddr}</span>
                            </p>
                            {cooldown > 0 && (
                                <p className="text-xs text-white/40 mb-4">
                                    You can request another email in {cooldown}s if needed.
                                </p>
                            )}
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-colors border border-white/10"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Header */}
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white">
                                    Reset Password
                                </h2>
                                <p className="text-white/60 mt-2 text-sm">
                                    Enter your email address and we'll send you a link to reset your password.
                                </p>
                            </div>

                            {/* Error Message */}
                            {status === 'error' && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {errorMessage}
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={emailAddr}
                                        onChange={(e) => setEmailAddr(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                        placeholder="your@email.com"
                                        required
                                        disabled={status === 'loading'}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={status === 'loading' || cooldown > 0}
                                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                                >
                                    {status === 'loading'
                                        ? 'Sending...'
                                        : cooldown > 0
                                            ? `Wait ${cooldown}s`
                                            : 'Send Reset Link'}
                                </button>
                                {cooldown > 0 && (
                                    <p className="text-center text-xs text-white/40">
                                        Throttled to reduce abuse. Thanks for your patience.
                                    </p>
                                )}
                            </form>

                            {/* Back to Login */}
                            <div className="mt-6 text-center">
                                <button
                                    onClick={onBackToLogin}
                                    className="text-white/50 hover:text-white text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back to Login
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
