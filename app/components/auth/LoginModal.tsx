'use client';

import { useState, useEffect } from 'react';
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

    const { data: sessionData } = authClient.useSession();
    const [requires2FA, setRequires2FA] = useState(false);
    const [totpCode, setTotpCode] = useState('');
    const [trustDevice, setTrustDevice] = useState(false);
    const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

    // Auto-detect if current session needs 2FA
    useEffect(() => {
        if ((sessionData as any)?.session?.isTwoFactorRequired) {
            setRequires2FA(true);
        }
    }, [sessionData]);

    if (!isOpen && !isForgotPasswordOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            console.log('[LoginModal] handleSubmit started');
            const response = await authClient.signIn.email({
                email,
                password,
            });

            console.log('[LoginModal] API Response JSON:', JSON.stringify(response));
            const { data, error: loginError } = response;

            if (loginError) {
                console.log('[LoginModal] Detected error code:', loginError.code);
                const is2FA = loginError.code === 'TWO_FACTOR_REQUIRED' ||
                    loginError.status === 403 ||
                    loginError.code === '403' ||
                    loginError.message?.toLowerCase().includes('two factor') ||
                    loginError.message?.toLowerCase().includes('totp');

                if (is2FA) {
                    console.log('[LoginModal] 2FA requirement detected via error status/code');
                    setRequires2FA(true);
                    setLoading(false);
                    return;
                }

                setError(loginError.message || 'Login failed. Please check your credentials.');
                setLoading(false);
                return;
            }

            const d = data as any;
            const is2FARequired = d?.twoFactorRequired === true ||
                d?.isTwoFactorRequired === true ||
                d?.twoFactorRedirect === true ||
                d?.nextStep === 'verify2fa' ||
                d?.nextStep === 'two-factor' ||
                d?.session?.isTwoFactorRequired === true;

            if (is2FARequired) {
                console.log('[LoginModal] 2FA requirement detected via data flag');
                setRequires2FA(true);
                setLoading(false);
                return;
            }

            // Fallback for partial data
            if (data && !d.session && !d.user) {
                console.log('[LoginModal] Partial data returned, assuming 2FA');
                setRequires2FA(true);
                setLoading(false);
                return;
            }

            // Final sanity: only redirect if we definitely see a session OR user
            if (!d?.session && !d?.user) {
                console.warn('[LoginModal] Success reported but missing session/user in data');
                setRequires2FA(true);
                setLoading(false);
                return;
            }

            // Success - redirect to home
            console.log('[LoginModal] Full login detected, doing final session check...');

            // Double check we actually have the session
            const { data: finalSession } = await authClient.getSession();
            if (!finalSession) {
                console.error('[LoginModal] Login appeared successful but session is missing');
                setError('Login succeeded but session failed to establish. Please try again.');
                return;
            }

            console.log('[LoginModal] Session verified. Redirecting...');
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
            const result = await twoFactor.verifyTotp(totpCode, trustDevice);
            console.log('[LoginModal] TOTP verification result:', result);

            if (result?.error) {
                setError(result.error.message || 'Invalid code');
                setLoading(false);
                return;
            }

            // CRITICAL FIX: Verify we actually have a valid session before redirecting
            // This prevents the "refresh loop" where we redirect too early
            console.log('[LoginModal] 2FA verified, checking session...');
            const { data: sessionData } = await authClient.getSession();

            if (!sessionData) {
                console.error('[LoginModal] Session check failed after 2FA verify');
                setError('Verification successful, but session failed to establish. Please try again.');
                setLoading(false);
                return;
            }

            console.log('[LoginModal] Session confirmed:', sessionData);

            // Success - close modal and redirect
            onClose();
            // detailed log for debugging
            console.log('[LoginModal] Redirecting to home...');
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
            onClick={handleClose}
        >
            <div
                className="relative w-full sm:max-w-md sm:mx-4 max-h-[90vh] sm:max-h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Mobile: rounded top, Desktop: fully rounded */}
                <div className="relative bg-gradient-to-br from-[#1a1f2e]/98 via-[#1a1d2e]/95 to-[#16181f]/98 backdrop-blur-xl rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-white/10 overflow-hidden">
                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 rounded-t-3xl sm:rounded-2xl pointer-events-none" />

                    {/* Drag handle for mobile */}
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 bg-white/20 rounded-full" />
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Scrollable content */}
                    <div className="relative px-5 sm:px-6 pb-6 pt-2 sm:pt-6 max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
                        {/* 2FA Verification View */}
                        {requires2FA ? (
                            <div className="relative">
                                <div className="mb-5">
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                                        Two-Factor Auth
                                    </h2>
                                    <p className="text-white/60 mt-1 text-sm">Enter the code from your authenticator app</p>
                                </div>

                                {error && (
                                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleTotpVerify} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-1.5">
                                            Verification Code
                                        </label>
                                        <input
                                            type="text"
                                            value={totpCode}
                                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            className="w-full px-4 py-3 sm:py-4 bg-white/5 border border-white/10 rounded-xl text-white text-center text-xl sm:text-2xl tracking-widest placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                            placeholder="000000"
                                            maxLength={6}
                                            inputMode="numeric"
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
                                        Remember this device
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
                                <div className="mb-5">
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                                        Welcome Back
                                    </h2>
                                    <p className="text-white/60 mt-1 text-sm">Sign in to continue trading</p>
                                </div>

                                {/* Error Message */}
                                {error && (
                                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                {/* Form */}
                                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-1.5">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-4 py-2.5 sm:py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all text-base"
                                            placeholder="your@email.com"
                                            required
                                            autoComplete="email"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
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
                                            className="w-full px-4 py-2.5 sm:py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all text-base"
                                            placeholder="••••••••"
                                            required
                                            autoComplete="current-password"
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
                                <div className="my-4 sm:my-5 flex items-center">
                                    <div className="flex-1 border-t border-white/10"></div>
                                    <span className="px-4 text-sm text-white/40">or</span>
                                    <div className="flex-1 border-t border-white/10"></div>
                                </div>

                                {/* Social Login */}
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setLoading(true);
                                        try {
                                            const res = await authClient.signIn.passkey();
                                            if (res?.error) {
                                                setError(res.error.message || 'Passkey login failed');
                                                setLoading(false);
                                            } else {
                                                onClose();
                                                window.location.href = '/';
                                            }
                                        } catch (e: any) {
                                            setError(e.message || 'Passkey login failed');
                                            setLoading(false);
                                        }
                                    }}
                                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white/10 text-white border border-white/20 rounded-xl hover:bg-white/20 transition-all font-medium backdrop-blur-sm"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.2-2.858.59-4.18" />
                                    </svg>
                                    Sign in with Passkey
                                </button>

                                <button
                                    onClick={() => (authClient as any).signIn.social({ provider: 'google', callbackURL: '/' })}
                                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 sm:py-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-colors font-medium"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Sign in with Google
                                </button>

                                {/* Switch to Signup */}
                                <p className="text-center text-white/50 text-sm mt-4 pb-2">
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
        </div>
    );
}
