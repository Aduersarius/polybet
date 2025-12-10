'use client';

import { useState } from 'react';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { motion } from 'framer-motion';
import { ArrowUpCircle, AlertCircle, CheckCircle } from 'lucide-react';

export default function WithdrawPage() {
    const [formData, setFormData] = useState({
        amount: '',
        token: 'USDC',
        address: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        try {
            const response = await fetch('/api/crypto/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: 'Withdrawal request submitted successfully!' });
                setFormData({ amount: '', token: 'USDC', address: '' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to submit withdrawal request' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
            <Navbar />

            <main className="max-w-2xl mx-auto px-4 py-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#1e1e1e] rounded-2xl border border-transparent p-8 hover:border-blue-500/50 transition-all duration-300"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <ArrowUpCircle className="w-8 h-8 text-blue-400" />
                        <h1 className="text-2xl font-bold text-white">Withdraw Funds</h1>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Amount
                            </label>
                            <input
                                type="number"
                                name="amount"
                                value={formData.amount}
                                onChange={handleChange}
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                required
                                className="w-full px-4 py-3 bg-[#2a2a2a] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Token Symbol
                            </label>
                            <select
                                name="token"
                                value={formData.token}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 bg-[#2a2a2a] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            >
                                <option value="USDC">USDC</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Wallet Address
                            </label>
                            <input
                                type="text"
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="0x..."
                                required
                                className="w-full px-4 py-3 bg-[#2a2a2a] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            />
                        </div>

                        {message && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex items-center gap-3 p-4 rounded-lg ${
                                    message.type === 'success'
                                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                }`}
                            >
                                {message.type === 'success' ? (
                                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                )}
                                <span className="text-sm">{message.text}</span>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <ArrowUpCircle className="w-5 h-5" />
                                    Submit Withdrawal Request
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 p-4 bg-[#2a2a2a] rounded-lg border border-yellow-500/20">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-gray-300">
                                <p className="font-medium text-yellow-400 mb-1">Important Notes:</p>
                                <ul className="space-y-1 text-xs">
                                    <li>• Withdrawals are processed manually and may take 1-3 business days</li>
                                    <li>• Ensure the wallet address is correct - funds cannot be recovered if sent to wrong address</li>
                                    <li>• A small processing fee may apply</li>
                                    <li>• TUSD is the internal platform currency equivalent to USDC, so no currency mismatch exists</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </main>

            <Footer />
        </div>
    );
}