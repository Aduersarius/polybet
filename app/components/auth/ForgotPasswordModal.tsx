'use client';

import { useEffect, useState } from 'react';
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

    if (!isOpen) return null;

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-md mx-4">
                {/* Modal Card */}
                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-2xl p-8 shadow-2xl">
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {status === 'success' ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
                            <p className="text-gray-400 mb-8">
                                We've sent a password reset link to <span className="text-white font-medium">{emailAddr}</span>
                            </p>
                            {cooldown > 0 && (
                                <p className="text-xs text-gray-500 mb-4">
                                    You can request another email in {cooldown}s if needed.
                                </p>
                            )}
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors border border-white/10"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                                    Reset Password
                                </h2>
                                <p className="text-gray-400 mt-2">
                                    Enter your email address and we'll send you a link to reset your password.
                                </p>
                            </div>

                            {/* Error Message */}
                            {status === 'error' && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {errorMessage}
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={emailAddr}
                                        onChange={(e) => setEmailAddr(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        placeholder="your@email.com"
                                        required
                                        disabled={status === 'loading'}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={status === 'loading' || cooldown > 0}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {status === 'loading'
                                        ? 'Sending...'
                                        : cooldown > 0
                                            ? `Wait ${cooldown}s`
                                            : 'Send Reset Link'}
                                </button>
                                {cooldown > 0 && (
                                    <p className="text-center text-xs text-gray-500">
                                        Throttled to reduce abuse. Thanks for your patience.
                                    </p>
                                )}
                            </form>

                            {/* Back to Login */}
                            <div className="mt-6 text-center">
                                <button
                                    onClick={onBackToLogin}
                                    className="text-gray-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back to Login
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
