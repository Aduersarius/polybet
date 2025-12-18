'use client';

import { SportsEventCard } from '../SportsEventCard';
import type { SportsEvent } from '@/types/sports';

interface FuturesGridProps {
  events: SportsEvent[];
}

export function FuturesGrid({ events }: FuturesGridProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-6xl mb-4">🗓️</div>
        <h3 className="text-xl font-semibold text-white/80 mb-2">
          No upcoming events
        </h3>
        <p className="text-white/50">
          Check back later for new betting opportunities
        </p>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map(event => (
        <SportsEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

