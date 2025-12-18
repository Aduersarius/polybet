'use client';

import { GameOddsButton } from './GameOddsButton';
import { useSportsTrading } from '@/contexts/SportsTradingContext';
import type { SportsEvent } from '@/types/sports';

interface LiveGameCardProps {
  event: SportsEvent;
  gameNumber?: number;
}

export function LiveGameCard({ event, gameNumber }: LiveGameCardProps) {
  const volume = event.volume || 0;
  const volumeDisplay = volume >= 1000000 
    ? `$${(volume / 1000000).toFixed(2)}M` 
    : volume >= 1000 
    ? `$${(volume / 1000).toFixed(2)}k` 
    : `$${volume.toFixed(0)}`;

  // Parse score if available (format: "1-0" or "2-1")
  // Only show scores for games with actual score data
  let scoreA = '';
  let scoreB = '';
  let hasScore = false;

  if (event.score && typeof event.score === 'string' && event.score.includes('-')) {
    const scores = event.score.split('-');
    scoreA = scores[0]?.trim() || '0';
    scoreB = scores[1]?.trim() || '0';
    hasScore = true;
  }
  
  // Extract BO format from title (Best of 3, Best of 5, etc.)
  const boMatch = event.title.match(/\(BO(\d+)\)/i);
  const bestOf = boMatch ? `BO${boMatch[1]}` : null;
  
  const { openEvent } = useSportsTrading();

  return (
    <div 
      onClick={() => openEvent(event)}
      className="bg-zinc-800 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Live/Upcoming Indicator */}
          {event.live ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 border border-red-500/30 rounded-md">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">LIVE</span>
            </div>
          ) : event.startTime && new Date(event.startTime) > new Date() ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">
                {new Date(event.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' '}
                {new Date(event.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded-md">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">FINISHED</span>
            </div>
          )}

          {/* Game Info */}
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span>{event.league || event.sport || 'Match'}</span>
            {bestOf && (
              <>
                <span>•</span>
                <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 text-[10px] font-semibold rounded">
                  {bestOf}
                </span>
              </>
            )}
            <span>•</span>
            <span className="text-white/40">{volumeDisplay} Vol.</span>
          </div>
        </div>

        {/* Game View Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            openEvent(event);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white/70 hover:text-white transition-all"
        >
          <span>{gameNumber || 1}</span>
          <span>Game View</span>
          <span>→</span>
        </button>
      </div>

      {/* Teams */}
      <div className="space-y-2">
        {/* Team A */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Score Box - only show if we have actual score data */}
            {hasScore && (
              <div className="flex items-center justify-center w-8 h-8 rounded bg-white/5 shrink-0">
                <span className="text-lg font-bold text-white">{scoreA}</span>
              </div>
            )}
            {/* Team Logo */}
            {event.teamALogo && (
              <img src={event.teamALogo} alt={event.teamA || ''} className="w-6 h-6 rounded shrink-0" />
            )}
            {/* Team Name */}
            <span className="text-sm font-medium text-white">{event.teamA || 'Team A'}</span>
          </div>
          {event.yesOdds && (
            <GameOddsButton 
              eventId={event.id}
              teamName={event.teamA || 'Team A'}
              odds={event.yesOdds}
              isFavorite={event.yesOdds > (event.noOdds || 0)}
              onClick={() => openEvent(event)}
            />
          )}
        </div>

        {/* Team B */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Score Box - only show if we have actual score data */}
            {hasScore && (
              <div className="flex items-center justify-center w-8 h-8 rounded bg-white/5 shrink-0">
                <span className="text-lg font-bold text-white">{scoreB}</span>
              </div>
            )}
            {/* Team Logo */}
            {event.teamBLogo && (
              <img src={event.teamBLogo} alt={event.teamB || ''} className="w-6 h-6 rounded shrink-0" />
            )}
            {/* Team Name */}
            <span className="text-sm font-medium text-white">{event.teamB || 'Team B'}</span>
          </div>
          {event.noOdds && (
            <GameOddsButton 
              eventId={event.id}
              teamName={event.teamB || 'Team B'}
              odds={event.noOdds}
              isFavorite={event.noOdds > (event.yesOdds || 0)}
              onClick={() => openEvent(event)}
            />
          )}
        </div>
      </div>

      {/* Period/Time */}
      {(event.period || event.elapsed) && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-white/50">
            {event.period && <span>{event.period}</span>}
            {event.period && event.elapsed && <span>•</span>}
            {event.elapsed && <span>{event.elapsed}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

