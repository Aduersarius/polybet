'use client';

import { LiveGameCard } from './LiveGameCard';
import type { SportsEvent } from '@/types/sports';

interface LiveGamesListProps {
  events: SportsEvent[];
}

// Group events by date
function groupEventsByDate(events: SportsEvent[]): Map<string, SportsEvent[]> {
  const grouped = new Map<string, SportsEvent[]>();
  
  events.forEach(event => {
    // Use startTime if available, otherwise use resolutionDate
    const date = event.startTime 
      ? new Date(event.startTime)
      : event.resolutionDate 
      ? new Date(event.resolutionDate)
      : new Date(); // Fallback to now
    
    const dateKey = date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  });
  
  return grouped;
}

export function LiveGamesList({ events }: LiveGamesListProps) {
  const groupedEvents = groupEventsByDate(events);
  
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-6xl mb-4">🏆</div>
        <h3 className="text-xl font-semibold text-white/80 mb-2">
          No live games at the moment
        </h3>
        <p className="text-white/50">
          Check back soon for live sports action!
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {Array.from(groupedEvents.entries()).map(([date, dateEvents]) => (
        <div key={date}>
          {/* Date Header */}
          <h2 className="text-lg font-bold text-white/90 mb-4 px-1">
            {date}
          </h2>
          
          {/* Events for this date */}
          <div className="space-y-3">
            {dateEvents.map((event, index) => (
              <LiveGameCard 
                key={event.id} 
                event={event}
                gameNumber={index + 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

