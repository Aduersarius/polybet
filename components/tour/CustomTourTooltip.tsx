'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface CustomTourTooltipProps {
  target: string;
  content: React.ReactNode;
  title: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  onNext?: () => void;
  onPrev?: () => void;
  onSkip?: () => void;
  currentStep: number;
  totalSteps: number;
  showPrev?: boolean;
}

export function CustomTourTooltip({
  target,
  content,
  title,
  placement = 'bottom',
  onNext,
  onPrev,
  onSkip,
  currentStep,
  totalSteps,
  showPrev = false,
}: CustomTourTooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const retryCountRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    retryCountRef.current = 0;
    setIsVisible(false);
    setTargetFound(false);
    
    const calculatePosition = () => {
      const targetElement = document.querySelector(target);
      
      if (!targetElement) {
        retryCountRef.current += 1;
        console.log(`⏳ Target not found (attempt ${retryCountRef.current}/10):`, target);
        
        // Retry up to 10 times with 300ms delay
        if (retryCountRef.current < 10) {
          setTimeout(calculatePosition, 300);
        } else {
          console.error('❌ Target never found, skipping to next step:', target);
          // Auto-skip to next step after timeout
          setTimeout(() => {
            if (onNext) onNext();
          }, 500);
        }
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);
      setTargetFound(true);

      if (!tooltipRef.current) {
        setTimeout(calculatePosition, 50);
        return;
      }

      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      let top = 0;
      let left = 0;

      switch (placement) {
        case 'bottom':
          top = rect.bottom + scrollY + 16;
          left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;
          break;
        case 'top':
          top = rect.top + scrollY - tooltipRect.height - 16;
          left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;
          break;
        case 'left':
          top = rect.top + scrollY + rect.height / 2 - tooltipRect.height / 2;
          left = rect.left + scrollX - tooltipRect.width - 16;
          break;
        case 'right':
          top = rect.top + scrollY + rect.height / 2 - tooltipRect.height / 2;
          left = rect.right + scrollX + 16;
          break;
      }

      // Keep tooltip on screen
      const maxLeft = window.innerWidth - tooltipRect.width - 20;
      const maxTop = window.innerHeight + scrollY - tooltipRect.height - 20;
      left = Math.max(20, Math.min(left, maxLeft));
      top = Math.max(scrollY + 20, Math.min(top, maxTop));

      setPosition({ top, left });
      setIsVisible(true);
      console.log('✅ Tooltip positioned at:', { top, left, target });
    };

    // Start calculating position
    const timer = setTimeout(calculatePosition, 100);
    
    const handleResize = () => {
      if (targetFound) calculatePosition();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [target, placement, onNext, targetFound]);

  if (!mounted) return null;

  // Calculate highlight position
  const getHighlightStyle = () => {
    if (!targetRect) return { display: 'none' };
    return {
      top: targetRect.top - 8,
      left: targetRect.left - 8,
      width: targetRect.width + 16,
      height: targetRect.height + 16,
      borderRadius: '12px',
    };
  };

  const tooltipContent = (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/70 z-[9998] pointer-events-none transition-opacity duration-300"
        style={{ 
          backdropFilter: 'blur(2px)',
          opacity: targetFound ? 1 : 0,
        }}
      />

      {/* Highlight spotlight */}
      {targetFound && targetRect && (
        <div
          className="fixed z-[9999] pointer-events-none transition-all duration-500 ease-out"
          style={{
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
            ...getHighlightStyle(),
          }}
        />
      )}

      {/* Pulsing highlight */}
      {targetFound && targetRect && (
        <div
          className="fixed z-[9999] pointer-events-none animate-pulse transition-all duration-500 ease-out"
          style={{
            border: '3px solid #3b82f6',
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.2)',
            ...getHighlightStyle(),
          }}
        />
      )}

      {/* Tooltip */}
      {targetFound && (
        <div
          ref={tooltipRef}
          className="fixed z-[10000] bg-[#1a1f2e] border border-blue-400/20 rounded-2xl shadow-2xl transition-all duration-500 ease-out"
          style={{
            top: position.top,
            left: position.left,
            opacity: isVisible ? 1 : 0,
            transform: `scale(${isVisible ? 1 : 0.9}) translateY(${isVisible ? 0 : '10px'})`,
            maxWidth: '420px',
            minWidth: '320px',
          }}
        >
        {/* Close button */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 font-medium">
              {currentStep + 1} / {totalSteps}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-white mb-3">{title}</h3>

          {/* Content */}
          <div className="text-sm text-gray-300 mb-6">{content}</div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Skip tour
            </button>

            <div className="flex gap-2">
              {showPrev && (
                <button
                  onClick={onPrev}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={onNext}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {currentStep === totalSteps - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Loading state */}
      {!targetFound && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] bg-[#1a1f2e] border border-blue-400/20 rounded-2xl shadow-2xl p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-400">Finding next element...</p>
            <button
              onClick={onSkip}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Skip tour
            </button>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(tooltipContent, document.body);
}

