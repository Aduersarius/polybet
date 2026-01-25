'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, BarChart3, Wallet, Shield } from 'lucide-react';

export default function AffiliateLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/affiliate/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Login failed');
                return;
            }

            // Store token
            if (data.token) {
                document.cookie = `affiliate_token=${data.token}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax; Secure`;
            }

            // Redirect to dashboard
            router.push('/affiliate/dashboard');
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const features = [
        { icon: BarChart3, text: 'Advanced analytics dashboard' },
        { icon: Wallet, text: 'Instant commission payouts' },
        { icon: Shield, text: 'Secure tracking technology' },
    ];

    return (
        <div className="min-h-screen bg-[var(--background)] flex">
            {/* Left Side - Features */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#1a2744] to-[#0d1a2d]">
                    <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center p-12 lg:p-16">
                    <Link href="/" className="mb-12">
                        <h1 className="text-2xl font-black tracking-tight">
                            <span className="bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">Pariflow</span>
                        </h1>
                    </Link>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
                            Partner<br />
                            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Dashboard</span>
                        </h2>
                        <p className="text-lg text-blue-100/60 mb-12 max-w-md">
                            Access your affiliate dashboard to track referrals, commissions, and performance.
                        </p>
                    </motion.div>

                    <div className="space-y-4">
                        {features.map((feature, index) => {
                            const Icon = feature.icon;
                            return (
                                <motion.div
                                    key={feature.text}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.2 + index * 0.1 }}
                                    className="flex items-center gap-3"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center shrink-0">
                                        <Icon className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <span className="text-blue-100/70">{feature.text}</span>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md"
                >
                    {/* Mobile Logo */}
                    <div className="lg:hidden mb-8 text-center">
                        <Link href="/">
                            <h1 className="text-2xl font-black tracking-tight inline-block">
                                <span className="bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">Pariflow</span>
                            </h1>
                        </Link>
                    </div>

                    <div className="bg-[var(--surface)] border border-white/10 rounded-2xl p-8 shadow-2xl">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                            <p className="text-zinc-500 text-sm">Sign in to your affiliate account</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-[var(--background)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-[var(--background)] border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-white/5"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                        Signing in...
                                    </span>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>

                        <div className="mt-6 pt-6 border-t border-white/5">
                            <p className="text-center text-zinc-500 text-sm">
                                Don&apos;t have an account?{' '}
                                <Link href="/affiliate/signup" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                                    Sign up
                                </Link>
                            </p>
                        </div>
                    </div>

                    <p className="text-center text-zinc-600 text-xs mt-6">
                        <Link href="/" className="hover:text-zinc-400 transition-colors">
                            ← Back to Pariflow
                        </Link>
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
