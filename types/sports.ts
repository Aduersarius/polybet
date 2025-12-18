// Sports event types and interfaces

export interface Team {
  id: number;
  name: string;
  logo?: string;
  abbreviation?: string;
  record?: string;
  league?: string;
}

export interface SportsEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  categories?: string[];
  resolutionDate: string;
  createdAt: string;
  imageUrl?: string | null;
  volume?: number;
  betCount?: number;
  yesOdds?: number;
  noOdds?: number;
  type?: string;
  outcomes?: Array<{
    id: string;
    name: string;
    probability: number;
    color?: string;
  }>;
  
  // Sports-specific fields
  league?: string;
  sport?: string;
  teamA?: string;
  teamB?: string;
  teamALogo?: string;
  teamBLogo?: string;
  score?: string;
  period?: string;
  elapsed?: string;
  live?: boolean;
  gameStatus?: 'scheduled' | 'live' | 'finished' | 'postponed';
  startTime?: string;
  isEsports?: boolean;
}

export type SportCategory = 
  | 'ESPORTS' 
  | 'FOOTBALL' 
  | 'BASKETBALL' 
  | 'BASEBALL' 
  | 'SOCCER' 
  | 'TENNIS' 
  | 'BOXING' 
  | 'MMA'
  | 'HOCKEY'
  | 'GOLF'
  | 'OTHER';

export type GameStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface PolymarketSportsEvent {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  category?: string;
  categories?: string[];
  endDate?: string;
  startDate?: string;
  createdAt?: string;
  image?: string | null;
  icon?: string | null;
  volume?: number | string;
  volumeNum?: number | string;
  volume24hr?: number | string;
  live?: boolean;
  gameStatus?: string;
  period?: string;
  elapsed?: string;
  score?: string;
  markets?: any[];
}

