'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check } from 'lucide-react';

interface DepositModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
    const [address, setAddress] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen && !address) {
            fetchAddress();
        }
    }, [isOpen]);

    const fetchAddress = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/crypto/deposit', {
                headers: {
                    'x-user-id': 'test-user-id' // TODO: Remove mock
                }
            });
            const data = await res.json();
            if (data.address) {
                setAddress(data.address);
            }
        } catch (error) {
            console.error('Failed to fetch address', error);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (address) {
            navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-md overflow-hidden rounded-2xl bg-zinc-900 p-6 shadow-xl border border-zinc-800"
                >
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 text-zinc-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>

                    <h2 className="mb-6 text-xl font-semibold text-white">Deposit USDC (Polygon)</h2>

                    <div className="flex flex-col items-center space-y-6">
                        {loading ? (
                            <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-zinc-800">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            </div>
                        ) : address ? (
                            <>
                                <div className="rounded-xl bg-white p-4">
                                    <QRCodeSVG value={address} size={180} />
                                </div>

                                <div className="w-full space-y-2">
                                    <label className="text-xs text-zinc-400">Deposit Address (ERC-20)</label>
                                    <div className="flex items-center gap-2 rounded-lg bg-zinc-800 p-3">
                                        <code className="flex-1 overflow-hidden text-ellipsis text-sm text-zinc-300">
                                            {address}
                                        </code>
                                        <button
                                            onClick={copyToClipboard}
                                            className="rounded-md p-2 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-lg bg-blue-500/10 p-4 text-sm text-blue-400 border border-blue-500/20">
                                    <p>Send only <strong>USDC</strong> on the <strong>Polygon</strong> network to this address. Sending other assets or using other networks may result in permanent loss.</p>
                                </div>
                            </>
                        ) : (
                            <div className="text-red-400">Failed to load address</div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
