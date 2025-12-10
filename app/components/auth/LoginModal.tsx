'use client';

import { useState } from 'react';
import { authClient, twoFactor } from '@/lib/auth-client';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSwitchToSignup: () => void;
}

export function LoginModal({ isOpen, onClose, onSwitchToSignup }: LoginModalProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // 2FA state
    const [requires2FA, setRequires2FA] = useState(false);
    const [totpCode, setTotpCode] = useState('');

    // Forgot Password state
    const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

    if (!isOpen && !isForgotPasswordOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        // ... existing submit logic ... (unchanged)
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // First, check if user has 2FA enabled
            const check2FARes = await fetch('/api/auth/check-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const { has2FA } = await check2FARes.json();

            // Attempt sign-in
            const response = await fetch('/api/auth/sign-in/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
            });

            const text = await response.text();
            let result;

            try {
                result = text ? JSON.parse(text) : {};
            } catch {
                result = {};
            }

            console.log('[LoginModal] Sign-in response:', { status: response.status, result, has2FA });

            // If password is wrong, show error
            if (!response.ok && !result.twoFactorRedirect) {
                setError(result.message || result.error?.message || result.error || 'Login failed. Please check your credentials.');
                setLoading(false);
                return;
            }

            // If user has 2FA enabled OR API indicates 2FA required, show TOTP input
            if (has2FA || result.twoFactorRedirect === true || result.code === 'TWO_FACTOR_REQUIRED') {
                console.log('[LoginModal] 2FA required, showing TOTP input');
                setRequires2FA(true);
                setLoading(false);
                return;
            }

            // Success without 2FA - close modal and refresh
            onClose();
            window.location.reload();
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleTotpVerify = async (e: React.FormEvent) => {
        // ... existing totp logic ... (unchanged)
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await twoFactor.verifyTotp(totpCode, true);

            if (result?.error) {
                setError(result.error.message || 'Invalid code');
                setLoading(false);
                return;
            }

            // Success - close modal and refresh
            onClose();
            window.location.reload();
        } catch (err: any) {
            console.error('TOTP verify error:', err);
            setError('Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRequires2FA(false);
        setTotpCode('');
        setError('');
        setIsForgotPasswordOpen(false);
        onClose();
    };

    if (isForgotPasswordOpen) {
        return (
            <ForgotPasswordModal
                isOpen={isForgotPasswordOpen}
                onClose={() => {
                    setIsForgotPasswordOpen(false);
                    onClose();
                }}
                onBackToLogin={() => setIsForgotPasswordOpen(false)}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-md mx-4">
                {/* Modal Card */}
                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-2xl p-8 shadow-2xl">
                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* 2FA Verification View */}
                    {requires2FA ? (
                        <>
                            <div className="mb-6">
                                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                                    Two-Factor Auth
                                </h2>
                                <p className="text-gray-400 mt-2">Enter the code from your authenticator app</p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleTotpVerify} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-lg text-white text-center text-2xl tracking-widest placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                                        placeholder="000000"
                                        maxLength={6}
                                        autoFocus
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || totpCode.length !== 6}
                                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Verifying...' : 'Verify'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setRequires2FA(false);
                                        setTotpCode('');
                                        setError('');
                                    }}
                                    className="w-full py-2 text-gray-400 hover:text-white transition-colors"
                                >
                                    ← Back to login
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="mb-6">
                                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                                    Welcome Back
                                </h2>
                                <p className="text-gray-400 mt-2">Sign in to continue trading</p>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        placeholder="your@email.com"
                                        required
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-300">
                                            Password
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setIsForgotPasswordOpen(true)}
                                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Signing in...' : 'Sign In'}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="my-6 flex items-center">
                                <div className="flex-1 border-t border-white/10"></div>
                                <span className="px-4 text-sm text-gray-500">or</span>
                                <div className="flex-1 border-t border-white/10"></div>
                            </div>

                            {/* Social Login Buttons */}
                            <div className="space-y-3 mb-6">
                                <button
                                    onClick={() => (authClient as any).signIn.social({ provider: 'google', callbackURL: '/' })}
                                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Sign in with Google
                                </button>
                            </div>

                            {/* Switch to Signup */}
                            <p className="text-center text-gray-400">
                                Don't have an account?{' '}
                                <button
                                    onClick={onSwitchToSignup}
                                    className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                                >
                                    Sign up
                                </button>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
