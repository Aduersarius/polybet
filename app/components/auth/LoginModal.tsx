'use client';

import { useState } from 'react';
import { authClient, twoFactor } from '@/lib/auth-client';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

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
    const [trustDevice, setTrustDevice] = useState(false);

    // Forgot Password state
    const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

    if (!isOpen && !isForgotPasswordOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        // ... existing submit logic ... (unchanged)
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data, error: loginError } = await authClient.signIn.email({
                email,
                password,
            });

            if (loginError) {
                // Better Auth returns a specific error code for 2FA
                if (loginError.code === 'TWO_FACTOR_REQUIRED') {
                    console.log('[LoginModal] 2FA required, showing TOTP input');
                    setRequires2FA(true);
                    setLoading(false);
                    return;
                }

                setError(loginError.message || 'Login failed. Please check your credentials.');
                setLoading(false);
                return;
            }

            // Success - redirect to home
            console.log('[LoginModal] Login successful, redirecting...');
            onClose();
            window.location.href = '/';
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleTotpVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            console.log('[LoginModal] Verifying TOTP code:', totpCode);

            // Better Auth's 2FA flow: After sign-in with email/password (which we already did),
            // verify the TOTP code separately using twoFactor.verifyTotp
            const result = await twoFactor.verifyTotp(totpCode, trustDevice);

            console.log('[LoginModal] TOTP verification result:', result);

            if (result?.error) {
                setError(result.error.message || 'Invalid code');
                setLoading(false);
                return;
            }

            // Success - close modal and redirect
            console.log('[LoginModal] 2FA verified successfully, redirecting...');
            setLoading(false);
            onClose();
            window.location.href = '/';
        } catch (err: any) {
            console.error('[LoginModal] TOTP verify error:', err);
            setError(err?.message || 'Invalid verification code');
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRequires2FA(false);
        setTotpCode('');
        setTrustDevice(false);
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
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-4"
            onClick={handleClose}
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
                        onClick={handleClose}
                        className="absolute top-4 right-4 z-10 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* 2FA Verification View */}
                    {requires2FA ? (
                        <div className="relative">
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white">
                                    Two-Factor Auth
                                </h2>
                                <p className="text-white/60 mt-2 text-sm">Enter the code from your authenticator app</p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleTotpVerify} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white text-center text-2xl tracking-widest placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                        placeholder="000000"
                                        maxLength={6}
                                        autoFocus
                                        required
                                    />
                                </div>

                                <label className="flex items-center gap-2.5 text-sm text-white/60">
                                    <input
                                        type="checkbox"
                                        checked={trustDevice}
                                        onChange={(e) => setTrustDevice(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50"
                                    />
                                    Remember this device (skip 2FA on this browser)
                                </label>

                                <button
                                    type="submit"
                                    disabled={loading || totpCode.length !== 6}
                                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                                >
                                    {loading ? 'Verifying...' : 'Verify'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setRequires2FA(false);
                                        setTotpCode('');
                                        setTrustDevice(false);
                                        setError('');
                                    }}
                                    className="w-full py-2 text-white/50 hover:text-white transition-colors text-sm"
                                >
                                    ← Back to login
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Header */}
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white">
                                    Welcome Back
                                </h2>
                                <p className="text-white/60 mt-2 text-sm">Sign in to continue trading</p>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                        placeholder="your@email.com"
                                        required
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-white/80">
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
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                                >
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <LoadingSpinner className="w-4 h-4 text-white" />
                                            <span>Signing in...</span>
                                        </div>
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="my-6 flex items-center">
                                <div className="flex-1 border-t border-white/10"></div>
                                <span className="px-4 text-sm text-white/40">or</span>
                                <div className="flex-1 border-t border-white/10"></div>
                            </div>

                            {/* Social Login Buttons */}
                            <div className="space-y-3 mb-6">
                                <button
                                    onClick={() => (authClient as any).signIn.social({ provider: 'google', callbackURL: '/' })}
                                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-colors font-medium"
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
                            <p className="text-center text-white/50 text-sm">
                                Don't have an account?{' '}
                                <button
                                    onClick={onSwitchToSignup}
                                    className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                                >
                                    Sign up
                                </button>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
