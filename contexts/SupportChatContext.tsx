'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface SupportChatContextType {
  isChatOpen: boolean;
  isChatMinimized: boolean;
  openChat: () => void;
  closeChat: () => void;
  minimizeChat: () => void;
  maximizeChat: () => void;
}

const SupportChatContext = createContext<SupportChatContextType | undefined>(undefined);

export function SupportChatProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  const openChat = () => {
    setIsChatOpen(true);
    setIsChatMinimized(false);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setIsChatMinimized(false);
  };

  const minimizeChat = () => {
    setIsChatMinimized(true);
  };

  const maximizeChat = () => {
    setIsChatMinimized(false);
  };

  return (
    <SupportChatContext.Provider value={{ isChatOpen, isChatMinimized, openChat, closeChat, minimizeChat, maximizeChat }}>
      {children}
    </SupportChatContext.Provider>
  );
}

export function useSupportChat() {
  const context = useContext(SupportChatContext);
  if (context === undefined) {
    throw new Error('useSupportChat must be used within a SupportChatProvider');
  }
  return context;
}

