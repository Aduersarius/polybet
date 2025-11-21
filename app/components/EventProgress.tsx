'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface EventProgressProps {
    creationDate: string;
    resolutionDate: string;
}

export function EventProgress({ creationDate, resolutionDate }: EventProgressProps) {
    const [timeLeft, setTimeLeft] = useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        total: number;
    }>({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });

    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const creation = new Date(creationDate).getTime();
            const resolution = new Date(resolutionDate).getTime();
            const now = Date.now();

            // Debug logging
            console.log('EventProgress Debug:', {
                creationDate,
                resolutionDate,
                creationTimestamp: creation,
                resolutionTimestamp: resolution,
                now,
                timeDiff: resolution - creation,
                elapsed: now - creation
            });

            const total = resolution - creation;
            const elapsed = now - creation;
            const remaining = Math.max(0, resolution - now);

            // Calculate progress percentage
            const progressPercent = Math.min(100, Math.max(0, (elapsed / total) * 100));
            setProgress(progressPercent);

            // Calculate time components
            const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            setTimeLeft({ days, hours, minutes, seconds, total: remaining });
        };

        // Calculate immediately
        calculateTimeLeft();

        // Update every second
        const timer = setInterval(calculateTimeLeft, 1000);

        return () => clearInterval(timer);
    }, [creationDate, resolutionDate]);

    const formatTime = (value: number, unit: string) => {
        return `${value.toString().padStart(2, '0')}${unit}`;
    };

    const isExpired = timeLeft.total <= 0;
    const isUrgent = timeLeft.total <= 3600000; // Less than 1 hour

    return (
        <div className="space-y-3">
            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Event Progress</span>
                    <span className={`font-mono ${isExpired ? 'text-red-400' : isUrgent ? 'text-yellow-400' : 'text-green-400'}`}>
                        {progress.toFixed(1)}%
                    </span>
                </div>

                <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                        className={`h-full rounded-full ${isExpired
                            ? 'bg-gradient-to-r from-red-500 to-red-600'
                            : isUrgent
                                ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                                : 'bg-gradient-to-r from-green-500 to-green-600'
                            }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />

                    {/* Animated pulse for urgent events */}
                    {isUrgent && !isExpired && (
                        <motion.div
                            className="absolute inset-0 bg-yellow-400/20 rounded-full"
                            animate={{ opacity: [0, 0.5, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                    )}
                </div>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center justify-center">
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${isExpired
                    ? 'bg-red-900/20 text-red-400 border border-red-500/20'
                    : isUrgent
                        ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-500/20'
                        : 'bg-green-900/20 text-green-400 border border-green-500/20'
                    }`}>
                    {isExpired ? '🔴 Event Resolved' : isUrgent ? '🟡 Ending Soon' : '🟢 Active Event'}
                </div>
            </div>
        </div>
    );
}