'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { email } from '@/lib/auth-client';
import { motion } from 'framer-motion';
import { LoginModal } from '@/app/components/auth/LoginModal';
import { SignupModal } from '@/app/components/auth/SignupModal';
import { validatePassword } from '@/lib/password-validation';

// Separate component that uses search params
function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState(errorParam || '');

    // Login/Signup modal state for the header interaction
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isSignupOpen, setIsSignupOpen] = useState(false);

    const validationErrors = useMemo(() => {
        if (!password) return [];
        const validation = validatePassword(password);
        return validation.errors;
    }, [password]);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMessage(errorParam || 'This reset link is missing or invalid. Please request a new link.');
        }
    }, [token, errorParam]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) {
            setErrorMessage('This reset link is missing or invalid. Please request a new link.');
            setStatus('error');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match');
            setStatus('error');
            return;
        }

        if (validationErrors.length > 0) {
            setErrorMessage(`Password requirements not met: ${validationErrors.join(', ')}`);
            setStatus('error');
            return;
        }

        setStatus('loading');
        setErrorMessage('');

        try {
            // BetterAuth handles the token automatically via the query param ?token=...
            // which should be present in the URL when this page is loaded
            const { error } = await email.resetPassword(password);

            if (error) {
                setErrorMessage(error.message || 'Failed to reset password. The link may have expired.');
                setStatus('error');
            } else {
                setStatus('success');
                // Optional: redirect to home after a delay
                setTimeout(() => {
                    router.push('/');
                }, 3000);
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'An unexpected error occurred');
            setStatus('error');
        }
    };

    if (!token) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md mx-auto"
            >
                <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Reset link is invalid</h2>
                    <p className="text-gray-400 mb-8">
                        The link may be missing, expired, or already used. Please request a new password reset email.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={() => router.push('/')}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors border border-white/10"
                        >
                            Return home
                        </button>
                        <button
                            onClick={() => router.push('/?action=forgot-password')}
                            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all"
                        >
                            Request new link
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    if (status === 'success') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md mx-auto"
            >
                <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Password Reset Complete</h2>
                    <p className="text-gray-400 mb-8">
                        Your password has been successfully updated. You can now log in with your new password.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all"
                    >
                        Go to Home
                    </button>

                    {/* Modals needed for consistency if we reused header logic, but simplistic here */}
                    <LoginModal
                        isOpen={isLoginOpen}
                        onClose={() => setIsLoginOpen(false)}
                        onSwitchToSignup={() => { setIsLoginOpen(false); setIsSignupOpen(true); }}
                    />
                    <SignupModal
                        isOpen={isSignupOpen}
                        onClose={() => setIsSignupOpen(false)}
                        onSwitchToLogin={() => { setIsSignupOpen(false); setIsLoginOpen(true); }}
                    />
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md mx-auto"
        >
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 mb-2">
                        Set New Password
                    </h1>
                    <p className="text-gray-400">
                        Please enter your new password below.
                    </p>
                </div>

                {errorMessage && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-3">
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{errorMessage}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            New Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            placeholder="At least 8 characters with uppercase, lowercase, number, and symbol"
                            required
                        />
                        {validationErrors.length > 0 && (
                            <ul className="mt-2 text-xs text-red-300 space-y-1 list-disc list-inside">
                                {validationErrors.map(req => (
                                    <li key={req}>{req}</li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            placeholder="Re-enter password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20"
                    >
                        {status === 'loading' ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                <span>Resetting...</span>
                            </div>
                        ) : 'Reset Password'}
                    </button>

                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                        >
                            Cancel and return to home
                        </button>
                    </div>
                </form>
            </div>

            {/* Required Modals (keep generic layout consistent) */}
            <LoginModal
                isOpen={isLoginOpen}
                onClose={() => setIsLoginOpen(false)}
                onSwitchToSignup={() => { setIsLoginOpen(false); setIsSignupOpen(true); }}
            />
            <SignupModal
                isOpen={isSignupOpen}
                onClose={() => setIsSignupOpen(false)}
                onSwitchToLogin={() => { setIsSignupOpen(false); setIsLoginOpen(true); }}
            />
        </motion.div>
    );
}

export default function ResetPasswordPage() {
    return (
        <main className="min-h-screen relative flex items-center justify-center p-4 bg-[#0a0a0a]">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 w-full">
                <Suspense fallback={
                    <div className="w-full max-w-md mx-auto bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 h-[400px] flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                }>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </main>
    );
}
