'use client';

import { useState, useEffect } from 'react';

interface EventCountdownProps {
    creationDate?: string;
    resolutionDate?: string;
}

export function EventCountdown({ creationDate, resolutionDate }: EventCountdownProps) {
    const [countdown, setCountdown] = useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        isExpired: boolean;
    } | null>(null);

    useEffect(() => {
        if (!creationDate || !resolutionDate) return;

        const updateCountdown = () => {
            const now = Date.now();
            const resolution = new Date(resolutionDate).getTime();
            const remaining = Math.max(0, resolution - now);

            const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            setCountdown({ days, hours, minutes, seconds, isExpired: remaining <= 0 });
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [creationDate, resolutionDate]);

    if (!countdown) return null;

    return (
        <div className="flex items-center gap-2 text-sm bg-[#1e1e1e]/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
            <svg className="w-4 h-4 text-[#bb86fc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-500">Ends in:</span>
            {countdown.isExpired ? (
                <span className="text-red-400 font-mono font-bold">ENDED</span>
            ) : (
                <div className="flex items-center gap-1 font-mono text-[#bb86fc] font-bold">
                    {countdown.days > 0 && <span>{countdown.days}d</span>}
                    {(countdown.days > 0 || countdown.hours > 0) && <span>{countdown.hours}h</span>}
                    <span>{countdown.minutes}m</span>
                    <span>{countdown.seconds}s</span>
                </div>
            )}
        </div>
    );
}
