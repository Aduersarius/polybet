// Category filtering logic for Pariflow markets

export interface CategoryDefinition {
  name: string;
  keywords: string[];
  subcategories?: string[];
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  // Business
  {
    name: 'Business',
    keywords: ['company', 'business', 'corporate', 'ceo', 'merger', 'acquisition', 'startup', 'ipo', 'earnings', 'revenue', 'profit'],
    subcategories: ['Companies', 'Startups', 'Corporate']
  },
  // Crypto
  {
    name: 'Crypto',
    keywords: ['btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'nft', 'opensea', 'airdrop', 'layerzero', 'crypto', 'blockchain', 'defi', 'web3', 'token', 'coin'],
    subcategories: ['Bitcoin', 'Ethereum', 'Solana', 'NFTs', 'Airdrops']
  },
  // Culture
  {
    name: 'Culture',
    keywords: ['movie', 'oscar', 'box office', 'song', 'album', 'grammy', 'spotify', 'twitter', 'x', 'youtube', 'mrbeast', 'celebrity', 'entertainment', 'netflix', 'disney', 'streaming'],
    subcategories: ['Movies', 'Music', 'Social', 'Entertainment']
  },
  // Economy
  {
    name: 'Economy',
    keywords: ['inflation', 'gdp', 'recession', 'fed', 'rate', 'interest', 'unemployment', 'jobs', 'labor', 'economic', 'monetary', 'fiscal'],
    subcategories: ['Monetary Policy', 'Employment', 'Growth']
  },
  // Elections
  {
    name: 'Elections',
    keywords: ['election', 'vote', 'ballot', 'primary', 'caucus', 'campaign', 'candidate', 'polling', 'electoral', 'midterm'],
    subcategories: ['US Elections', 'Global Elections', 'Primaries']
  },
  // Finance
  {
    name: 'Finance',
    keywords: ['stock', 'market', 'nasdaq', 'dow', 's&p', 'trading', 'investment', 'hedge', 'fund', 'bank', 'wall street', 'price', 'valuation'],
    subcategories: ['Stocks', 'Markets', 'Banking']
  },
  // Politics
  {
    name: 'Politics',
    keywords: ['trump', 'biden', 'harris', 'war', 'uk', 'eu', 'china', 'law', 'bill', 'policy', 'government', 'president', 'senate', 'congress', 'legislation'],
    subcategories: ['US Politics', 'Global', 'Policy']
  },
  // Science
  {
    name: 'Science',
    keywords: ['gpt', 'openai', 'gemini', 'artificial', 'spacex', 'mars', 'nasa', 'moon', 'temp', 'climate', 'degree', 'ai', 'space', 'science', 'research', 'discovery'],
    subcategories: ['AI', 'Space', 'Climate', 'Research']
  },
  // Sports
  {
    name: 'Sports',
    keywords: ['soccer', 'premier league', 'champions', 'ufc', 'fight', 'mcgregor', 'nba', 'lebron', 'f1', 'formula', 'football', 'basketball', 'mma', 'racing', 'sports', 'nfl', 'mlb'],
    subcategories: ['Football', 'MMA/UFC', 'Basketball', 'Racing']
  },
  // Tech
  {
    name: 'Tech',
    keywords: ['apple', 'google', 'microsoft', 'meta', 'amazon', 'nvidia', 'chip', 'semiconductor', 'software', 'hardware', 'app', 'technology', 'tech', 'device'],
    subcategories: ['Big Tech', 'Hardware', 'Software']
  },
  // World
  {
    name: 'World',
    keywords: ['international', 'global', 'united nations', 'treaty', 'diplomatic', 'foreign', 'geopolitical', 'conflict', 'peace', 'summit'],
    subcategories: ['Geopolitics', 'Diplomacy', 'Conflicts']
  },
  // Esports
  {
    name: 'Esports',
    keywords: ['esports', 'e-sports', 'gaming', 'league of legends', 'dota', 'csgo', 'valorant', 'overwatch', 'fortnite', 'twitch', 'streamer', 'tournament'],
    subcategories: ['League of Legends', 'Dota 2', 'CS:GO', 'Valorant']
  }
];

// Pre-compile word-boundary regexes for short keywords to avoid ReDoS from repeated compilation
// and improve performance during categorization.
const WORD_BOUNDARY_REGEX_CACHE = new Map<string, RegExp>();

CATEGORY_DEFINITIONS.forEach(category => {
  category.keywords.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    if (keywordLower.length <= 4) {
      // Escape special characters to prevent ReDoS/invalid regex
      const escapedKeyword = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      WORD_BOUNDARY_REGEX_CACHE.set(keywordLower, new RegExp(`\\b${escapedKeyword}\\b`, 'i')); // nosemgrep
    }
  });
});

/**
 * Categorize an event based on its title and description using keyword matching
 * Uses word boundary matching to prevent false positives (e.g., "Coinbase" matching "nba")
 */
export function categorizeEvent(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const categories: string[] = [];

  for (const category of CATEGORY_DEFINITIONS) {
    // Check if any keywords match using word boundaries
    const hasKeywordMatch = category.keywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();

      // Use cached word boundary regex for short keywords (<=4 chars) to avoid false matches
      // e.g., "nba" shouldn't match "Coinbase", "f1" shouldn't match "ref1"
      if (keywordLower.length <= 4) {
        const regex = WORD_BOUNDARY_REGEX_CACHE.get(keywordLower);
        return regex ? regex.test(text) : false;
      }

      // For longer keywords, substring matching is fine
      return text.includes(keywordLower);
    });

    if (hasKeywordMatch) {
      categories.push(category.name);
    }
  }

  return categories;
}

/**
 * Get all available category names
 */
export function getAllCategories(): string[] {
  return CATEGORY_DEFINITIONS.map(cat => cat.name);
}

/**
 * Get category definition by name
 */
export function getCategoryByName(name: string): CategoryDefinition | undefined {
  return CATEGORY_DEFINITIONS.find(cat => cat.name === name);
}

/**
 * Get subcategories for a category
 */
export function getSubcategories(categoryName: string): string[] {
  const category = getCategoryByName(categoryName);
  return category?.subcategories || [];
}