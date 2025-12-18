// Sports classification and detection utilities

import type { SportsEvent, SportCategory } from '@/types/sports';

// Esports keywords for detection
const ESPORTS_KEYWORDS = [
  'csgo', 'counter-strike', 'counter strike',
  'dota', 'dota 2',
  'league of legends', 'lol',
  'valorant',
  'overwatch',
  'rocket league',
  'call of duty', 'cod',
  'apex legends',
  'fortnite',
  'starcraft',
  'hearthstone',
  'smash', 'super smash',
  'fifa esports', 'madden',
  'rainbow six', 'r6',
  'pubg',
  'warzone',
  'halo',
  'mortal kombat', 'street fighter', 'tekken',
  'esports', 'e-sports', 'gaming tournament',
];

// Traditional sports keywords by category
const SPORTS_KEYWORDS: Record<Exclude<SportCategory, 'ESPORTS' | 'OTHER'>, string[]> = {
  FOOTBALL: ['nfl', 'football', 'super bowl', 'quarterback', 'touchdown', 'ncaa football'],
  BASKETBALL: ['nba', 'basketball', 'ncaa basketball', 'march madness', 'playoff'],
  BASEBALL: ['mlb', 'baseball', 'world series', 'pitcher', 'home run'],
  SOCCER: ['fifa', 'world cup', 'premier league', 'la liga', 'champions league', 'soccer', 'football', 'messi', 'ronaldo', 'uefa'],
  TENNIS: ['tennis', 'wimbledon', 'us open', 'french open', 'australian open', 'grand slam'],
  BOXING: ['boxing', 'fight', 'heavyweight', 'championship bout'],
  MMA: ['ufc', 'mma', 'mixed martial arts', 'bellator', 'octagon'],
  HOCKEY: ['nhl', 'hockey', 'stanley cup', 'ice hockey'],
  GOLF: ['pga', 'golf', 'masters', 'open championship', 'ryder cup'],
};

/**
 * Detect if an event is an esports event
 */
export function isEsports(event: Partial<SportsEvent>): boolean {
  const title = event.title?.toLowerCase() || '';
  const description = event.description?.toLowerCase() || '';
  const league = event.league?.toLowerCase() || '';
  const categories = (event.categories || []).map(c => c.toLowerCase());
  
  const searchText = `${title} ${description} ${league} ${categories.join(' ')}`;
  
  return ESPORTS_KEYWORDS.some(keyword => searchText.includes(keyword));
}

/**
 * Detect sport category from event data
 */
export function getSportCategory(event: Partial<SportsEvent>): SportCategory {
  if (isEsports(event)) {
    return 'ESPORTS';
  }
  
  const title = event.title?.toLowerCase() || '';
  const description = event.description?.toLowerCase() || '';
  const league = event.league?.toLowerCase() || '';
  const categories = (event.categories || []).map(c => c.toLowerCase());
  
  const searchText = `${title} ${description} ${league} ${categories.join(' ')}`;
  
  // Check each sport category
  for (const [category, keywords] of Object.entries(SPORTS_KEYWORDS)) {
    if (keywords.some(keyword => searchText.includes(keyword))) {
      return category as SportCategory;
    }
  }
  
  return 'OTHER';
}

/**
 * Detect league from event data
 */
export function detectLeague(event: Partial<SportsEvent>): string | undefined {
  if (event.league) return event.league;
  
  const title = event.title?.toLowerCase() || '';
  const description = event.description?.toLowerCase() || '';
  const searchText = `${title} ${description}`;
  
  // Check for common leagues
  const leagues = [
    { pattern: /\bnfl\b/i, name: 'NFL' },
    { pattern: /\bnba\b/i, name: 'NBA' },
    { pattern: /\bmlb\b/i, name: 'MLB' },
    { pattern: /\bnhl\b/i, name: 'NHL' },
    { pattern: /\bufc\b/i, name: 'UFC' },
    { pattern: /\bpga\b/i, name: 'PGA' },
    { pattern: /premier league/i, name: 'Premier League' },
    { pattern: /champions league/i, name: 'Champions League' },
    { pattern: /la liga/i, name: 'La Liga' },
    { pattern: /\bcsgo\b/i, name: 'CSGO' },
    { pattern: /dota 2/i, name: 'Dota 2' },
    { pattern: /league of legends|\blol\b/i, name: 'League of Legends' },
    { pattern: /valorant/i, name: 'Valorant' },
  ];
  
  for (const { pattern, name } of leagues) {
    if (pattern.test(searchText)) {
      return name;
    }
  }
  
  return undefined;
}

/**
 * Detect sport type from event data
 */
export function detectSport(event: Partial<SportsEvent>): string | undefined {
  const category = getSportCategory(event);
  
  const categoryToSport: Record<SportCategory, string> = {
    ESPORTS: 'esports',
    FOOTBALL: 'football',
    BASKETBALL: 'basketball',
    BASEBALL: 'baseball',
    SOCCER: 'soccer',
    TENNIS: 'tennis',
    BOXING: 'boxing',
    MMA: 'mma',
    HOCKEY: 'hockey',
    GOLF: 'golf',
    OTHER: 'other',
  };
  
  return categoryToSport[category];
}

/**
 * Get icon/emoji for sport category
 */
export function getSportIcon(category: SportCategory): string {
  const icons: Record<SportCategory, string> = {
    ESPORTS: '🎮',
    FOOTBALL: '🏈',
    BASKETBALL: '🏀',
    BASEBALL: '⚾',
    SOCCER: '⚽',
    TENNIS: '🎾',
    BOXING: '🥊',
    MMA: '🥋',
    HOCKEY: '🏒',
    GOLF: '⛳',
    OTHER: '🏆',
  };
  
  return icons[category] || '🏆';
}

/**
 * Parse team names from event title
 * Common formats: "Team A vs Team B", "Team A @ Team B", "Team A - Team B"
 * Also handles: "Counter-Strike: Team A vs Team B (BO3)"
 */
export function parseTeams(title: string): { teamA?: string; teamB?: string } {
  // Remove common game prefixes FIRST (before parsing teams)
  let cleanTitle = title
    .replace(/^(counter-strike|cs2|csgo|dota 2|league of legends|lol|valorant|rocket league):\s*/i, '')
    .trim();
  
  // Remove BO format from anywhere in the title (move to metadata)
  cleanTitle = cleanTitle.replace(/\s*\(BO\d+\)/gi, '').trim();
  
  // Try various patterns
  const patterns = [
    /(.+?)\s+vs\.?\s+(.+)/i,
    /(.+?)\s+@\s+(.+)/i,
    /(.+?)\s+-\s+(.+)/i,
    /(.+?)\s+v\.?\s+(.+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleanTitle.match(pattern);
    if (match) {
      return {
        teamA: match[1].trim(),
        teamB: match[2].trim(),
      };
    }
  }
  
  return {};
}

/**
 * Normalize game status from various formats
 */
export function normalizeGameStatus(status?: string): 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | undefined {
  if (!status) return undefined;
  
  const normalized = status.toLowerCase();
  
  if (normalized.includes('live') || normalized.includes('in progress')) {
    return 'live';
  }
  if (normalized.includes('finished') || normalized.includes('final') || normalized.includes('ended')) {
    return 'finished';
  }
  if (normalized.includes('cancelled') || normalized.includes('canceled')) {
    return 'cancelled';
  }
  if (normalized.includes('postponed') || normalized.includes('delayed')) {
    return 'postponed';
  }
  if (normalized.includes('scheduled') || normalized.includes('upcoming')) {
    return 'scheduled';
  }
  
  return undefined;
}

