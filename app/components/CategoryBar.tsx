'use client';
import { useRef, useLayoutEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Category {
  id: string;
  label: string;
}

interface CategoryBarProps {
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  categories: Category[];
}

export function CategoryBar({ selectedCategory, onCategoryChange, categories }: CategoryBarProps) {
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Update indicator position when selected category changes or on resize
  useLayoutEffect(() => {
    const updateIndicatorPosition = () => {
      const activeButton = buttonRefs.current.get(selectedCategory);
      const container = containerRef.current;

      if (!activeButton || !container) {
        setIndicatorStyle({ left: 0, width: 0, opacity: 0 });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;

      setIndicatorStyle({ left, width, opacity: 1 });
    };

    updateIndicatorPosition();

    // Update on window resize
    window.addEventListener('resize', updateIndicatorPosition);
    return () => window.removeEventListener('resize', updateIndicatorPosition);
  }, [selectedCategory, categories]);

  const isFavorites = selectedCategory === 'FAVORITES';

  return (
    <div className="w-full border-t border-blue-400/10 bg-gray-800 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 py-1.5">
        <div className="overflow-x-auto scrollbar-hide">
          <div 
            ref={containerRef}
            className="relative flex items-center gap-2 category-nav"
          >
            {/* Sliding Indicator Background */}
            <motion.div
              className={`absolute h-6 rounded-lg ${
                isFavorites
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 shadow-[0_4px_16px_rgba(244,63,94,0.4)]'
                  : 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_4px_16px_rgba(59,130,246,0.4)]'
              }`}
              initial={false}
              animate={{
                x: indicatorStyle.left,
                y: '-50%',
                width: indicatorStyle.width,
                opacity: indicatorStyle.opacity,
              }}
              transition={{
                type: 'spring',
                stiffness: 450,
                damping: 35,
                mass: 0.6,
              }}
              style={{
                left: 0,
                top: '50%',
                willChange: 'transform, width',
              }}
            />

            <div className="relative z-10 flex gap-1.5 min-w-max">
              {categories.map((cat) => 
                cat.id === 'SPORTS' ? (
                  <Link key={cat.id} href="/sports">
                    <motion.button
                      ref={(el) => {
                        if (el) {
                          buttonRefs.current.set(cat.id, el);
                        } else {
                          buttonRefs.current.delete(cat.id);
                        }
                      }}
                      className={`px-3.5 py-1 rounded-lg text-[11px] font-bold transition-colors duration-300 whitespace-nowrap uppercase tracking-wide ${
                        selectedCategory === cat.id
                          ? 'text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      {cat.label}
                    </motion.button>
                  </Link>
                ) : (
                  <motion.button
                    key={cat.id}
                    ref={(el) => {
                      if (el) {
                        buttonRefs.current.set(cat.id, el);
                      } else {
                        buttonRefs.current.delete(cat.id);
                      }
                    }}
                    onClick={() => onCategoryChange(cat.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors duration-300 whitespace-nowrap uppercase tracking-wide ${
                      selectedCategory === cat.id
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 25,
                    }}
                  >
                    {cat.label}
                  </motion.button>
                )
              )}
            </div>
            <div className="relative z-10 h-4 w-px bg-blue-400/20"></div>
            <motion.button
              ref={(el) => {
                if (el) {
                  buttonRefs.current.set('FAVORITES', el);
                } else {
                  buttonRefs.current.delete('FAVORITES');
                }
              }}
              onClick={() => onCategoryChange('FAVORITES')}
              className={`relative z-10 p-1 rounded-lg transition-colors duration-300 whitespace-nowrap flex items-center justify-center ${
                selectedCategory === 'FAVORITES'
                  ? 'text-white'
                  : 'text-gray-400 hover:text-pink-400'
              }`}
              whileHover={{ scale: 1.1, rotate: selectedCategory === 'FAVORITES' ? 0 : 5 }}
              whileTap={{ scale: 0.9 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
              }}
            >
              <motion.svg
                className="w-3.5 h-3.5"
                fill={selectedCategory === 'FAVORITES' ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
                animate={{
                  scale: selectedCategory === 'FAVORITES' ? [1, 1.2, 1] : 1,
                }}
                transition={{
                  duration: 0.3,
                  ease: 'easeOut',
                }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </motion.svg>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
