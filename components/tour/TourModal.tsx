'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Search, Heart, TrendingUp, BarChart3, Wallet } from 'lucide-react';

interface TourSlide {
  icon: React.ReactNode;
  title: string;
  description: string;
  preview?: React.ReactNode;
}

interface TourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const tourSlides: TourSlide[] = [
  {
    icon: <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10" />,
    title: 'Welcome to Pariflow',
    description: 'Trade on real-world events and profit from your predictions.',
    preview: (
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gradient-to-br from-[#1a1f2e] to-[#141824] border border-blue-400/20 rounded-lg p-2.5">
          <div className="text-[9px] text-blue-400 font-medium mb-0.5">POLITICS</div>
          <div className="text-[11px] text-white mb-1.5 line-clamp-1">2024 Election</div>
          <div className="flex gap-1">
            <div className="flex-1 bg-green-500/20 rounded px-1.5 py-0.5">
              <div className="text-[10px] text-green-400 font-bold">65%</div>
            </div>
            <div className="flex-1 bg-red-500/20 rounded px-1.5 py-0.5">
              <div className="text-[10px] text-red-400 font-bold">35%</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1f2e] to-[#141824] border border-purple-400/20 rounded-lg p-2.5">
          <div className="text-[9px] text-purple-400 font-medium mb-0.5">CRYPTO</div>
          <div className="text-[11px] text-white mb-1.5 line-clamp-1">BTC $100k?</div>
          <div className="flex gap-1">
            <div className="flex-1 bg-green-500/20 rounded px-1.5 py-0.5">
              <div className="text-[10px] text-green-400 font-bold">72%</div>
            </div>
            <div className="flex-1 bg-red-500/20 rounded px-1.5 py-0.5">
              <div className="text-[10px] text-red-400 font-bold">28%</div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Search className="w-8 h-8 sm:w-10 sm:h-10" />,
    title: 'Discover Markets',
    description: 'Search and filter through prediction markets across politics, sports, crypto, and more.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center gap-2 text-gray-400">
          <Search className="w-3.5 h-3.5" />
          <div className="flex-1 h-7 bg-gray-800/50 rounded border border-gray-700/30 flex items-center px-2.5 text-[11px]">
            Search events...
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['All', 'Politics', 'Sports', 'Crypto'].map((cat) => (
            <div key={cat} className="px-2 py-0.5 bg-blue-500/10 border border-blue-400/20 rounded text-[10px] text-blue-400">
              {cat}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <BarChart3 className="w-8 h-8 sm:w-10 sm:h-10" />,
    title: 'Read Market Odds',
    description: 'Higher odds indicate higher market confidence in that outcome.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
        <div className="text-[11px] text-gray-400 font-medium">Will Bitcoin reach $100k?</div>
        <div className="flex gap-2">
          <div className="flex-1 bg-green-500/10 border border-green-400/20 rounded p-2">
            <div className="text-[10px] text-gray-400">YES</div>
            <div className="text-base font-bold text-green-400">68%</div>
          </div>
          <div className="flex-1 bg-red-500/10 border border-red-400/20 rounded p-2">
            <div className="text-[10px] text-gray-400">NO</div>
            <div className="text-base font-bold text-red-400">32%</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Heart className="w-8 h-8 sm:w-10 sm:h-10" />,
    title: 'Track Favorites',
    description: 'Bookmark interesting markets to your watchlist for quick access.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-gray-400">Your Watchlist</div>
          <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
        </div>
        <div className="space-y-1">
          {['Bitcoin $100k?', 'US Elections', 'ETH Price'].map((item) => (
            <div key={item} className="text-[11px] text-gray-300 py-1 px-2 bg-gray-800/30 rounded flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-blue-400"></div>
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <Wallet className="w-8 h-8 sm:w-10 sm:h-10" />,
    title: 'Ready to Trade',
    description: 'Click any market to view charts, place trades, and build your portfolio.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
        <div className="flex gap-2">
          <button className="flex-1 bg-green-500/20 border border-green-400/30 rounded py-1.5 text-[11px] text-green-400 font-medium">
            Buy YES
          </button>
          <button className="flex-1 bg-red-500/20 border border-red-400/30 rounded py-1.5 text-[11px] text-red-400 font-medium">
            Buy NO
          </button>
        </div>
        <div className="bg-gray-800/30 rounded p-2 text-[11px] text-gray-400">
          <div className="flex justify-between mb-0.5">
            <span>Amount:</span>
            <span className="text-white">$100</span>
          </div>
          <div className="flex justify-between">
            <span>Potential win:</span>
            <span className="text-green-400">$147</span>
          </div>
        </div>
      </div>
    ),
  },
];

export function TourModal({ isOpen, onClose, onComplete }: TourModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSlide, onComplete, onClose]);

  const handleNext = () => {
    if (currentSlide < tourSlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  if (!isOpen) return null;

  const slide = tourSlides[currentSlide];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[340px] sm:max-w-md bg-gradient-to-b from-[#1a1f2e] to-[#0f1419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/5 z-10"
          aria-label="Close tour"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-5 sm:p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/20 flex items-center justify-center text-blue-400">
              {slide.icon}
            </div>
          </div>

          {/* Step indicator */}
          <div className="text-center mb-2">
            <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
              Step {currentSlide + 1} of {tourSlides.length}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
            {slide.title}
          </h2>

          {/* Description */}
          <p className="text-xs sm:text-sm text-gray-400 text-center leading-relaxed mb-4">
            {slide.description}
          </p>

          {/* Preview */}
          {slide.preview && (
            <div className="mb-4">
              {slide.preview}
            </div>
          )}

          {/* Navigation */}
          <div className="space-y-3">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5">
              {tourSlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? 'w-6 bg-blue-500'
                      : 'w-1.5 bg-gray-700 hover:bg-gray-600'
                  }`}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3">
              {currentSlide > 0 ? (
                <button
                  onClick={handlePrev}
                  className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Skip
                </button>
              )}

              <button
                onClick={handleNext}
                className="flex-1 h-10 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {currentSlide === tourSlides.length - 1 ? (
                  'Get Started'
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
