'use client';

import { EventCountdown } from './EventCountdown';
import { ShareDropdown } from './ShareDropdown';

interface CompactEventPanelProps {
    eventTitle: string;
    eventId: string;
    eventSlug?: string | null;
    volume?: number;
    creationDate?: string;
    resolutionDate?: string;
}

function VolumeDisplay({ volume }: { volume?: number }) {
    const formatVolume = (vol?: number) => {
        if (!vol) return '$0';
        if (vol >= 1000000) return `$${(vol / 1000000).toFixed(2)}m`;
        if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}k`;
        return `$${Math.round(vol)}`;
    };

    return (
        <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-gray-500">Volume:</span>
            <span className="text-[#03dac6] font-bold">
                {formatVolume(volume)}
            </span>
        </div>
    );
}

export function CompactEventPanel({
    eventTitle,
    eventId,
    eventSlug,
    volume,
    creationDate,
    resolutionDate
}: CompactEventPanelProps) {
    return (
        <div className="relative flex items-center gap-3">
            <VolumeDisplay volume={volume} />
            <EventCountdown creationDate={creationDate} resolutionDate={resolutionDate} />
            <div className="absolute bottom-0 right-0">
                <ShareDropdown eventTitle={eventTitle} eventId={eventId} eventSlug={eventSlug} />
            </div>
        </div>
    );
}