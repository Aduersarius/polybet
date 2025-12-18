'use client';

interface GameOddsButtonProps {
  eventId: string;
  teamName: string;
  odds: number;
  isFavorite?: boolean;
  onClick?: () => void;
}

export function GameOddsButton({ eventId, teamName, odds, isFavorite = false, onClick }: GameOddsButtonProps) {
  const oddsPercentage = Math.round(odds * 100);
  const displayOdds = `${oddsPercentage}¢`;
  
  // Extract team abbreviation (first 3-4 letters or first word)
  const abbreviation = teamName.split(' ')[0].substring(0, 4).toUpperCase();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (onClick) {
      onClick(); // Call parent's onClick to open trading sidebar
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all hover:scale-105 cursor-pointer ${
        isFavorite
          ? 'bg-gradient-to-r from-red-500/80 to-red-600/80 text-white hover:from-red-500 hover:to-red-600'
          : 'bg-gradient-to-r from-blue-500/80 to-blue-600/80 text-white hover:from-blue-500 hover:to-blue-600'
      }`}
    >
      {abbreviation} {displayOdds}
    </button>
  );
}

