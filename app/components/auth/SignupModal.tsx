'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { validatePassword, getPasswordErrorMessage } from '@/lib/password-validation';
import { EmailVerificationModal } from './EmailVerificationModal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface SignupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSwitchToLogin: () => void;
}

export function SignupModal({ isOpen, onClose, onSwitchToLogin }: SignupModalProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [promoCodeValid, setPromoCodeValid] = useState<boolean | null>(null);
    const [promoCodeName, setPromoCodeName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showVerificationModal, setShowVerificationModal] = useState(false);
    const [signedUpEmail, setSignedUpEmail] = useState('');

    if (!isOpen && !showVerificationModal) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validation
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            setError(getPasswordErrorMessage(passwordValidation.errors));
            return;
        }

        setLoading(true);

        try {
            // Use Better Auth's fetch API directly
            const response = await fetch('/api/auth/sign-up/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    name: email.split('@')[0] // Use email local part as default name
                }),
            });

            // Check if response has content
            const text = await response.text();
            let result;

            try {
                result = text ? JSON.parse(text) : {};
            } catch {
                result = {};
            }

            if (!response.ok) {
                setError(result.message || result.error || 'Signup failed. Please try again.');
            } else {
                // Success - link to affiliate if applicable (non-blocking)
                try {
                    await fetch('/api/affiliate/link-user', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            promoCode: promoCode || undefined
                        }),
                    });
                } catch (affiliateError) {
                    // Don't fail signup if affiliate linking fails
                    console.error('Affiliate linking error (non-blocking):', affiliateError);
                }

                // Success - show verification modal
                setSignedUpEmail(email);
                setShowVerificationModal(true);
                // Clear form
                setEmail('');
                setPassword('');
                setConfirmPassword('');
                setPromoCode('');
                setPromoCodeValid(null);
                setPromoCodeName(null);
            }
        } catch (err: any) {
            console.error('Signup error:', err);
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Signup Modal */}
            {isOpen && !showVerificationModal && (
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
                                {/* Header */}
                                <div className="mb-6">
                                    <h2 className="text-2xl font-bold text-white">
                                        Create Account
                                    </h2>
                                    <p className="text-white/60 mt-2 text-sm">Start your prediction journey</p>
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
                                        <label className="block text-sm font-medium text-white/80 mb-2">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                            placeholder="••••••••"
                                            required
                                            minLength={8}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">
                                            Confirm Password
                                        </label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                            placeholder="••••••••"
                                            required
                                            minLength={8}
                                        />
                                    </div>

                                    {/* Promo Code Input (Optional) */}
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">
                                            Promo Code (Optional)
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={promoCode}
                                                onChange={async (e) => {
                                                    const value = e.target.value.toUpperCase();
                                                    setPromoCode(value);

                                                    if (value.length >= 3) {
                                                        // Validate promo code
                                                        try {
                                                            const res = await fetch(`/api/affiliate/validate-code?code=${encodeURIComponent(value)}&type=promo`);
                                                            const data = await res.json();
                                                            setPromoCodeValid(data.valid);
                                                            setPromoCodeName(data.affiliateName || null);
                                                        } catch {
                                                            setPromoCodeValid(false);
                                                            setPromoCodeName(null);
                                                        }
                                                    } else {
                                                        setPromoCodeValid(null);
                                                        setPromoCodeName(null);
                                                    }
                                                }}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 hover:border-white/20 transition-all"
                                                placeholder="Enter promo code"
                                            />
                                            {promoCodeValid === true && promoCodeName && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-medium">
                                                    ✓ {promoCodeName}
                                                </div>
                                            )}
                                            {promoCodeValid === false && promoCode.length >= 3 && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs font-medium">
                                                    Invalid
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                                    >
                                        {loading ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <LoadingSpinner className="w-4 h-4 text-white" />
                                                <span>Creating account...</span>
                                            </div>
                                        ) : (
                                            'Create Account'
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
                                        Sign up with Google
                                    </button>
                                </div>

                                {/* Switch to Login */}
                                <p className="text-center text-white/50 text-sm">
                                    Already have an account?{' '}
                                    <button
                                        onClick={onSwitchToLogin}
                                        className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                                    >
                                        Sign in
                                    </button>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Verification Modal */}
            <EmailVerificationModal
                isOpen={showVerificationModal}
                onClose={() => {
                    setShowVerificationModal(false);
                    onClose(); // Close the signup modal as well
                }}
                userEmail={signedUpEmail}
            />
        </>
    );
}
