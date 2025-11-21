'use client';
import { motion } from 'framer-motion';

interface Category {
  id: string;
  label: string;
  icon: string;
}

const categories: Category[] = [
  { id: 'ALL', label: 'All', icon: '' },
  { id: 'TRENDING', label: 'Trending', icon: '' },
  { id: 'NEW', label: 'New', icon: '' },
  { id: 'CRYPTO', label: 'Crypto', icon: '' },
  { id: 'SPORTS', label: 'Sports', icon: '' },
  { id: 'POLITICS', label: 'Politics', icon: '' },
  { id: 'FINANCE', label: 'Finance', icon: '' },
  { id: 'TECH', label: 'Tech', icon: '' },
  { id: 'CULTURE', label: 'Culture', icon: '' },
  { id: 'WORLD', label: 'World', icon: '' },
  { id: 'ECONOMY', label: 'Economy', icon: '' },
  { id: 'ELECTIONS', label: 'Elections', icon: '' },
  { id: 'SCIENCE', label: 'Science', icon: '' },
];

interface CategoryBarProps {
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
}

export function CategoryBar({ selectedCategory, onCategoryChange }: CategoryBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="fixed top-[72px] left-0 right-0 z-40"
    >
      {/* Material Design Island - Narrow */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          <div className="px-4 py-2">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-1.5 justify-between">
                {categories.map((cat) => (
                  <motion.button
                    key={cat.id}
                    onClick={() => onCategoryChange(cat.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-sm transition-all text-center ${selectedCategory === cat.id
                      ? 'bg-gradient-to-r from-[#bb86fc] to-[#03dac6] text-white shadow-lg shadow-[#bb86fc]/30'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    {cat.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
