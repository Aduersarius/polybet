// Category filtering logic for PolyBet markets

export interface CategoryDefinition {
  name: string;
  keywords: string[];
  subcategories?: string[];
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  // Crypto
  {
    name: 'Crypto',
    keywords: ['btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'nft', 'opensea', 'airdrop', 'layerzero', 'crypto', 'blockchain', 'defi', 'web3'],
    subcategories: ['Bitcoin', 'Ethereum', 'Solana', 'NFTs', 'Airdrops']
  },
  // Politics
  {
    name: 'Politics',
    keywords: ['trump', 'biden', 'harris', 'election', 'war', 'uk', 'eu', 'china', 'law', 'bill', 'fed', 'rate', 'policy', 'government', 'president', 'senate', 'congress'],
    subcategories: ['US Election', 'Global', 'Policy']
  },
  // Sports
  {
    name: 'Sports',
    keywords: ['soccer', 'premier league', 'champions', 'ufc', 'fight', 'mcgregor', 'nba', 'lebron', 'f1', 'formula', 'football', 'basketball', 'mma', 'racing', 'sports'],
    subcategories: ['Football', 'MMA/UFC', 'Basketball', 'Racing']
  },
  // Business
  {
    name: 'Business',
    keywords: ['inflation', 'gdp', 'recession', 'stock', 'apple', 'tesla', 'nvidia', 'price', 'economy', 'market', 'company', 'business', 'finance'],
    subcategories: ['Economy', 'Stocks']
  },
  // Science
  {
    name: 'Science',
    keywords: ['gpt', 'openai', 'gemini', 'artificial', 'spacex', 'mars', 'nasa', 'moon', 'temp', 'climate', 'degree', 'ai', 'space', 'science', 'technology'],
    subcategories: ['AI', 'Space', 'Climate']
  },
  // Pop Culture
  {
    name: 'Pop Culture',
    keywords: ['movie', 'oscar', 'box office', 'song', 'album', 'grammy', 'spotify', 'twitter', 'x', 'youtube', 'mrbeast', 'celebrity', 'entertainment'],
    subcategories: ['Movies', 'Music', 'Social']
  }
];

/**
 * Categorize an event based on its title and description using keyword matching
 */
export function categorizeEvent(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const categories: string[] = [];

  for (const category of CATEGORY_DEFINITIONS) {
    // Check if any keywords match
    const hasKeywordMatch = category.keywords.some(keyword =>
      text.includes(keyword.toLowerCase())
    );

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