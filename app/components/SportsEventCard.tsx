'use client';

import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { getSportIcon, getSportCategory } from '@/lib/sports-classifier';
import { useSportsTrading } from '@/contexts/SportsTradingContext';
import type { SportsEvent } from '@/types/sports';

interface SportsEventCardProps {
  event: SportsEvent;
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 border border-red-500/30 rounded-md">
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">LIVE</span>
    </div>
  );
}

function formatTimeUntil(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'Started';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function SportsEventCard({ event }: SportsEventCardProps) {
  const sportCategory = getSportCategory(event);
  const sportIcon = getSportIcon(sportCategory);
  const isBinary = event.type !== 'MULTIPLE' && event.outcomes?.length === 2;
  const { openEvent } = useSportsTrading();

  return (
    <motion.div
      onClick={() => openEvent(event)}
      whileTap={{ opacity: 0.9 }}
      className="relative h-full overflow-hidden bg-zinc-800 rounded-xl border border-white/5 hover:border-white/10 transition-all duration-150 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
    >
      <div className="relative p-4 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {/* League/Sport Badge */}
            {event.league && (
              <span className="px-2 py-1 bg-blue-500/10 border border-blue-400/20 rounded-md text-[10px] font-bold text-blue-300 uppercase tracking-wide">
                {event.league}
              </span>
            )}

            {/* Esports Badge */}
            {event.isEsports && (
              <span className="px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 rounded-md text-[10px] font-bold text-purple-300 uppercase tracking-wide">
                {sportIcon} Esports
              </span>
            )}
          </div>

          {/* Live Indicator or Start Time */}
          {event.live ? (
            <LiveIndicator />
          ) : event.startTime && (
            <div className="flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 rounded-md">
              <Clock className="w-3 h-3 text-white/50" />
              <span className="text-[10px] font-medium text-white/60">
                {formatTimeUntil(event.startTime)}
              </span>
            </div>
          )}
        </div>

        {/* Teams */}
        {event.teamA && event.teamB ? (
          <div className="mb-3">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm font-semibold text-white">{event.teamA}</span>
              <span className="text-xs text-white/40">vs</span>
              <span className="text-sm font-semibold text-white">{event.teamB}</span>
            </div>

            {/* Score */}
            {event.score && (
              <div className="mt-2 flex items-center justify-center gap-3">
                <span className="text-2xl font-bold text-emerald-400">{event.score}</span>
                {event.period && (
                  <span className="text-xs text-white/50">{event.period}</span>
                )}
                {event.elapsed && (
                  <span className="text-xs text-white/50">{event.elapsed}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Event Title */
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-white line-clamp-2 leading-tight">
              {event.title}
            </h3>
          </div>
        )}

        {/* Odds */}
        <div className="mt-auto">
          {isBinary ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-lg">
                <div className="text-[10px] text-emerald-400 font-medium mb-0.5">YES</div>
                <div className="text-lg font-bold text-emerald-300">
                  {event.yesOdds ? `${Math.round(event.yesOdds * 100)}%` : '—'}
                </div>
              </div>
              <div className="px-3 py-2 bg-rose-500/10 border border-rose-400/20 rounded-lg">
                <div className="text-[10px] text-rose-400 font-medium mb-0.5">NO</div>
                <div className="text-lg font-bold text-rose-300">
                  {event.noOdds ? `${Math.round(event.noOdds * 100)}%` : '—'}
                </div>
              </div>
            </div>
          ) : event.outcomes && event.outcomes.length > 0 ? (
            <div className="space-y-1.5">
              {event.outcomes.slice(0, 3).map((outcome) => (
                <div
                  key={outcome.id}
                  className="flex items-center justify-between px-3 py-1.5 bg-white/5 rounded-lg border border-white/10"
                >
                  <span className="text-xs text-white/80 truncate">{outcome.name}</span>
                  <span className="text-xs font-bold text-white/90 ml-2">
                    {outcome.probability !== undefined && outcome.probability >= 0
                      ? `${Math.round(outcome.probability * 100)}%`
                      : '—'}
                  </span>
                </div>
              ))}
              {event.outcomes.length > 3 && (
                <div className="text-[10px] text-white/40 text-center">
                  +{event.outcomes.length - 3} more
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Volume */}
        {event.volume !== undefined && event.volume > 0 && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase tracking-wide">Volume</span>
              <span className="text-xs font-semibold text-white/70">
                ${event.volume >= 1000000
                  ? `${(event.volume / 1000000).toFixed(1)}M`
                  : event.volume >= 1000
                    ? `${(event.volume / 1000).toFixed(1)}K`
                    : event.volume.toFixed(0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

