'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');

        if (!token) {
            setStatus('error');
            setMessage('Invalid verification link. No token provided.');
            return;
        }

        // The verification is handled by better-auth automatically
        // This page just shows the result
        const verifyEmail = async () => {
            try {
                const response = await fetch(`/api/auth/verify-email?token=${token}`, {
                    method: 'GET',
                    credentials: 'include',
                });

                if (response.ok) {
                    setStatus('success');
                    setMessage('Your email has been verified successfully!');
                    // Redirect to home after 3 seconds
                    setTimeout(() => router.push('/'), 3000);
                } else {
                    const data = await response.json().catch(() => ({}));
                    setStatus('error');
                    setMessage(data.message || 'Verification failed. The link may have expired.');
                }
            } catch (error) {
                console.error('Verification error:', error);
                setStatus('error');
                setMessage('An error occurred during verification.');
            }
        };

        verifyEmail();
    }, [searchParams, router]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-white/10 rounded-2xl p-8 text-center"
        >
            {status === 'loading' && (
                <>
                    <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">Verifying your email...</h1>
                    <p className="text-gray-400">Please wait while we verify your email address.</p>
                </>
            )}

            {status === 'success' && (
                <>
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    >
                        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    </motion.div>
                    <h1 className="text-2xl font-bold text-white mb-2">Email Verified!</h1>
                    <p className="text-gray-400 mb-6">{message}</p>
                    <p className="text-gray-500 text-sm">Redirecting you to the homepage...</p>
                </>
            )}

            {status === 'error' && (
                <>
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    >
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    </motion.div>
                    <h1 className="text-2xl font-bold text-white mb-2">Verification Failed</h1>
                    <p className="text-gray-400 mb-6">{message}</p>
                    <div className="flex flex-col gap-3">
                        <Link
                            href="/"
                            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all"
                        >
                            Go to Homepage
                        </Link>
                        <Link
                            href="/settings"
                            className="w-full py-3 border border-white/10 text-gray-400 font-semibold rounded-lg hover:bg-white/5 transition-all"
                        >
                            Resend Verification Email
                        </Link>
                    </div>
                </>
            )}
        </motion.div>
    );
}

function LoadingFallback() {
    return (
        <div className="max-w-md w-full bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-white/10 rounded-2xl p-8 text-center">
            <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Loading...</h1>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
            <Suspense fallback={<LoadingFallback />}>
                <VerifyEmailContent />
            </Suspense>
        </div>
    );
}
