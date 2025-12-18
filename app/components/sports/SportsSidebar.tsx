'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SportCategory {
  id: string;
  label: string;
  icon: string;
  count?: number;
  subcategories?: SportCategory[];
}

interface SportsSidebarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  eventCounts?: Record<string, number>;
}

const categories: SportCategory[] = [
  { id: 'popular', label: 'POPULAR', icon: '🔥' },
  { id: 'nfl', label: 'NFL', icon: '🏈' },
  { id: 'cfb', label: 'CFB', icon: '🏈' },
  { id: 'nba', label: 'NBA', icon: '🏀' },
  { id: 'nhl', label: 'NHL', icon: '🏒' },
  { id: 'ufc', label: 'UFC', icon: '🥊' },
  { 
    id: 'football', 
    label: 'Football', 
    icon: '⚽',
    subcategories: [
      { id: 'epl', label: 'EPL', icon: '⚽' },
      { id: 'la-liga', label: 'La Liga', icon: '⚽' },
      { id: 'bundesliga', label: 'Bundesliga', icon: '⚽' },
      { id: 'serie-a', label: 'Serie A', icon: '⚽' },
    ]
  },
  { 
    id: 'esports', 
    label: 'Esports', 
    icon: '🎮',
    subcategories: [
      { id: 'cs2', label: 'CS2', icon: '🔫' },
      { id: 'lol', label: 'LoL', icon: '⚔️' },
      { id: 'dota2', label: 'Dota 2', icon: '🛡️' },
      { id: 'rocket-league', label: 'Rocket League', icon: '🚗' },
    ]
  },
  { id: 'cricket', label: 'Cricket', icon: '🏏' },
  { id: 'tennis', label: 'Tennis', icon: '🎾' },
  { id: 'golf', label: 'Golf', icon: '⛳' },
];

export function SportsSidebar({ selectedCategory, onSelectCategory, eventCounts = {} }: SportsSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['esports', 'football']));

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const getCount = (categoryId: string) => {
    return eventCounts[categoryId] || 0;
  };

  return (
    <div className="w-64 bg-[#1a2332] border-r border-white/5 h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="p-4 space-y-1">
        {categories.map((category) => (
          <div key={category.id}>
            {/* Main Category */}
            <button
              onClick={() => {
                if (category.subcategories) {
                  toggleCategory(category.id);
                } else {
                  onSelectCategory(category.id);
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === category.id && !category.subcategories
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {category.subcategories && (
                  expandedCategories.has(category.id) ? 
                    <ChevronDown className="w-3.5 h-3.5" /> : 
                    <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span className="text-base">{category.icon}</span>
                <span>{category.label}</span>
              </div>
              {getCount(category.id) > 0 && (
                <span className="text-xs text-white/40">{getCount(category.id)}</span>
              )}
            </button>

            {/* Subcategories */}
            {category.subcategories && expandedCategories.has(category.id) && (
              <div className="ml-6 mt-1 space-y-1">
                {category.subcategories.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => onSelectCategory(sub.id)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-all ${
                      selectedCategory === sub.id
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{sub.icon}</span>
                      <span>{sub.label}</span>
                    </div>
                    {getCount(sub.id) > 0 && (
                      <span className="text-xs text-white/40">{getCount(sub.id)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

