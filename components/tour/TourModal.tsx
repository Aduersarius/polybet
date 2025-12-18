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

const tourSlides = [
  {
    icon: <TrendingUp className="w-12 h-12" />,
    title: 'Welcome to Polybet',
    description: 'Trade on real-world events and profit from your predictions. Join thousands of traders in the prediction market revolution.',
    preview: (
      <div className="relative">
        {/* Decorative background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 rounded-xl blur-xl"></div>
        
        {/* Event cards grid */}
        <div className="relative grid grid-cols-2 gap-3">
          {/* Card 1 */}
          <div className="bg-gradient-to-br from-[#1a1f2e] to-[#141824] border border-blue-400/20 rounded-lg p-3 transform hover:scale-105 transition-transform">
            <div className="text-[10px] text-blue-400 font-medium mb-1">POLITICS</div>
            <div className="text-xs text-white mb-2 line-clamp-2">2024 Presidential Election</div>
            <div className="flex gap-1.5">
              <div className="flex-1 bg-green-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-green-400 font-bold">65%</div>
              </div>
              <div className="flex-1 bg-red-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-red-400 font-bold">35%</div>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-gradient-to-br from-[#1a1f2e] to-[#141824] border border-purple-400/20 rounded-lg p-3 transform hover:scale-105 transition-transform">
            <div className="text-[10px] text-purple-400 font-medium mb-1">CRYPTO</div>
            <div className="text-xs text-white mb-2 line-clamp-2">Bitcoin $100k in 2025?</div>
            <div className="flex gap-1.5">
              <div className="flex-1 bg-green-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-green-400 font-bold">72%</div>
              </div>
              <div className="flex-1 bg-red-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-red-400 font-bold">28%</div>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-gradient-to-br from-[#1a1f2e] to-[#141824] border border-orange-400/20 rounded-lg p-3 transform hover:scale-105 transition-transform">
            <div className="text-[10px] text-orange-400 font-medium mb-1">SPORTS</div>
            <div className="text-xs text-white mb-2 line-clamp-2">Super Bowl Champions</div>
            <div className="flex gap-1.5">
              <div className="flex-1 bg-green-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-green-400 font-bold">58%</div>
              </div>
              <div className="flex-1 bg-red-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-red-400 font-bold">42%</div>
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-gradient-to-br from-[#1a1f2e] to-[#141824] border border-pink-400/20 rounded-lg p-3 transform hover:scale-105 transition-transform">
            <div className="text-[10px] text-pink-400 font-medium mb-1">TECH</div>
            <div className="text-xs text-white mb-2 line-clamp-2">AI Breakthrough 2025</div>
            <div className="flex gap-1.5">
              <div className="flex-1 bg-green-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-green-400 font-bold">81%</div>
              </div>
              <div className="flex-1 bg-red-500/20 rounded px-2 py-1">
                <div className="text-[10px] text-red-400 font-bold">19%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats overlay */}
        <div className="mt-4 flex items-center justify-center gap-6 text-center">
          <div>
            <div className="text-lg font-bold text-blue-400">500+</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Markets</div>
          </div>
          <div className="w-px h-8 bg-gray-700"></div>
          <div>
            <div className="text-lg font-bold text-purple-400">$2.5M</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Volume</div>
          </div>
          <div className="w-px h-8 bg-gray-700"></div>
          <div>
            <div className="text-lg font-bold text-pink-400">24/7</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Trading</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Search className="w-12 h-12" />,
    title: 'Discover Markets',
    description: 'Search and filter through hundreds of prediction markets across politics, sports, crypto, and more.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-gray-400">
          <Search className="w-4 h-4" />
          <div className="flex-1 h-8 bg-gray-800/50 rounded border border-gray-700/30 flex items-center px-3 text-xs">
            Search events...
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', 'Politics', 'Sports', 'Crypto'].map((cat) => (
            <div key={cat} className="px-3 py-1 bg-blue-500/10 border border-blue-400/20 rounded text-xs text-blue-400">
              {cat}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <BarChart3 className="w-12 h-12" />,
    title: 'Read Market Odds',
    description: 'Each market shows live odds and trading volume. Higher odds indicate higher market confidence in that outcome.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-3 space-y-2">
        <div className="text-xs text-gray-400 font-medium">Will Bitcoin reach $100k in 2025?</div>
        <div className="flex gap-2">
          <div className="flex-1 bg-green-500/10 border border-green-400/20 rounded p-2">
            <div className="text-xs text-gray-400">YES</div>
            <div className="text-lg font-bold text-green-400">68%</div>
          </div>
          <div className="flex-1 bg-red-500/10 border border-red-400/20 rounded p-2">
            <div className="text-xs text-gray-400">NO</div>
            <div className="text-lg font-bold text-red-400">32%</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">Volume: $125,430</div>
      </div>
    ),
  },
  {
    icon: <Heart className="w-12 h-12" />,
    title: 'Track Your Favorites',
    description: 'Bookmark interesting markets to your watchlist for quick access and real-time updates.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-400">Your Watchlist</div>
          <Heart className="w-4 h-4 text-pink-400 fill-pink-400" />
        </div>
        <div className="space-y-1.5">
          {['Bitcoin $100k?', 'US Elections 2024', 'ETH Price Prediction'].map((item) => (
            <div key={item} className="text-xs text-gray-300 py-1 px-2 bg-gray-800/30 rounded flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400"></div>
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <Wallet className="w-12 h-12" />,
    title: 'Ready to Trade',
    description: 'Click any market to view detailed charts, place trades, and start building your portfolio.',
    preview: (
      <div className="bg-[#1a1f2e]/50 border border-gray-700/50 rounded-lg p-3 space-y-2">
        <div className="text-xs text-gray-400 mb-2">Trading Panel</div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <button className="flex-1 bg-green-500/20 border border-green-400/30 rounded py-2 text-xs text-green-400 font-medium">
              Buy YES
            </button>
            <button className="flex-1 bg-red-500/20 border border-red-400/30 rounded py-2 text-xs text-red-400 font-medium">
              Buy NO
            </button>
          </div>
          <div className="bg-gray-800/30 rounded p-2 text-xs text-gray-400">
            <div className="flex justify-between mb-1">
              <span>Amount:</span>
              <span className="text-white">$100</span>
            </div>
            <div className="flex justify-between">
              <span>Potential win:</span>
              <span className="text-green-400">$147</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function TourModal({ isOpen, onClose, onComplete }: TourModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  useEffect(() => {
    if (!isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentSlide < tourSlides.length - 1) {
      setDirection('forward');
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setDirection('backward');
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  const slide = tourSlides[currentSlide];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-500"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-[#0f1419]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 fade-in duration-500">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-5 right-5 text-gray-500 hover:text-gray-300 transition-colors z-10"
          aria-label="Close tour"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-10">
          <div
            className="transition-all duration-500"
            key={currentSlide}
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                {slide.icon}
              </div>
            </div>

            {/* Step indicator */}
            <div className="text-center mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Step {currentSlide + 1} of {tourSlides.length}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white text-center mb-4">
              {slide.title}
            </h2>

            {/* Description */}
            <p className="text-base text-gray-400 text-center leading-relaxed mb-6">
              {slide.description}
            </p>

            {/* Preview */}
            {slide.preview && (
              <div className="mt-6">
                {slide.preview}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="space-y-4 mt-8">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2">
              {tourSlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > currentSlide ? 'forward' : 'backward');
                    setCurrentSlide(index);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? 'w-8 bg-blue-500'
                      : 'w-1.5 bg-gray-700 hover:bg-gray-600'
                  }`}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Skip
              </button>

              <div className="flex items-center gap-2">
                {currentSlide > 0 && (
                  <button
                    onClick={handlePrev}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
                    aria-label="Previous step"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                <button
                  onClick={handleNext}
                  className="px-6 h-10 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
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

    </div>
  );
}

