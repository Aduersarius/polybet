'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import type { SportsEvent } from '@/types/sports';

interface SportsTradingState {
  selectedEvent: SportsEvent | null;
  isSidebarOpen: boolean;
  openEvent: (event: SportsEvent) => void;
  closeEvent: () => void;
}

const SportsTradingContext = createContext<SportsTradingState | undefined>(undefined);

export function SportsTradingProvider({ children }: { children: ReactNode }) {
  const [selectedEvent, setSelectedEvent] = useState<SportsEvent | null>(null);
  
  const openEvent = (event: SportsEvent) => {
    setSelectedEvent(event);
  };
  
  const closeEvent = () => {
    setSelectedEvent(null);
  };
  
  const isSidebarOpen = selectedEvent !== null;
  
  return (
    <SportsTradingContext.Provider
      value={{
        selectedEvent,
        isSidebarOpen,
        openEvent,
        closeEvent,
      }}
    >
      {children}
    </SportsTradingContext.Provider>
  );
}

export function useSportsTrading() {
  const context = useContext(SportsTradingContext);
  if (context === undefined) {
    throw new Error('useSportsTrading must be used within a SportsTradingProvider');
  }
  return context;
}

