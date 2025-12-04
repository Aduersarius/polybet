'use client';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface Category {
  id: string;
  label: string;
  icon: string;
}

// Default categories while loading
const defaultCategories: Category[] = [
  { id: 'ALL', label: 'All', icon: '' },
  { id: 'TRENDING', label: 'Trending', icon: '' },
  { id: 'NEW', label: 'New', icon: '' },
  { id: 'FAVORITES', label: 'Favorites', icon: '' },
];

interface CategoryBarProps {
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
}

export function CategoryBar({ selectedCategory, onCategoryChange }: CategoryBarProps) {
  const [categories, setCategories] = useState<Category[]>(defaultCategories);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        if (response.ok) {
          const data = await response.json();
          const fetchedCategories: Category[] = data.categories.map((cat: string) => ({
            id: cat,
            label: cat === 'ALL' ? 'All' :
              cat === 'TRENDING' ? 'Trending' :
                cat === 'NEW' ? 'New' :
                  cat === 'FAVORITES' ? 'Favorites' :
                    cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(),
            icon: ''
          }));
          setCategories(fetchedCategories);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        // Keep default categories on error
      }
    };

    fetchCategories();
  }, []);

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
              <div className="flex items-center gap-2">
                {categories.filter(cat => cat.id !== 'FAVORITES').map((cat) => (
                  <motion.button
                    key={cat.id}
                    onClick={() => onCategoryChange(cat.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all text-center whitespace-nowrap ${selectedCategory === cat.id
                      ? 'bg-gradient-to-r from-[#bb86fc] to-[#03dac6] text-white shadow-lg shadow-[#bb86fc]/30'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    {cat.label}
                  </motion.button>
                ))}
                <div className="h-6 w-px bg-white/20"></div>
                <motion.button
                  onClick={() => onCategoryChange('FAVORITES')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center justify-center ${selectedCategory === 'FAVORITES'
                    ? 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <svg className="w-5 h-5" fill={selectedCategory === 'FAVORITES' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
