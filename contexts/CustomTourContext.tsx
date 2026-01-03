'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { TourModal } from '@/components/tour/TourModal';

interface CustomTourContextType {
  startTour: () => void;
  skipTour: () => void;
  resetTour: () => void;
  isActive: boolean;
}

const CustomTourContext = createContext<CustomTourContextType | null>(null);

const TOUR_STORAGE_KEY = 'pariflow-tour-completed';

export function CustomTourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);

    // Check if tour should auto-start
    if (typeof window !== 'undefined') {
      const tourCompleted = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!tourCompleted && pathname === '/') {
        // Auto-start tour after 5 seconds for first-time visitors
        const timer = setTimeout(() => {
          console.log('🚀 Auto-starting tour for first-time visitor');
          setIsActive(true);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [pathname]);

  const startTour = useCallback(() => {
    console.log('🚀 Starting tour');
    setIsActive(true);
    localStorage.removeItem(TOUR_STORAGE_KEY);
  }, []);

  const skipTour = useCallback(() => {
    console.log('⏭️ Skipping tour');
    setIsActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  const resetTour = useCallback(() => {
    console.log('🔄 Resetting tour');
    localStorage.removeItem(TOUR_STORAGE_KEY);
    setIsActive(false);
  }, []);

  const handleComplete = useCallback(() => {
    console.log('✅ Tour completed!');
    setIsActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  return (
    <CustomTourContext.Provider
      value={{
        startTour,
        skipTour,
        resetTour,
        isActive,
      }}
    >
      {mounted && (
        <TourModal
          isOpen={isActive}
          onClose={skipTour}
          onComplete={handleComplete}
        />
      )}
      {children}
    </CustomTourContext.Provider>
  );
}

export function useCustomTour() {
  const context = useContext(CustomTourContext);
  if (!context) {
    throw new Error('useCustomTour must be used within CustomTourProvider');
  }
  return context;
}

