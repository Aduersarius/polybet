'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useSportsTrading } from '@/contexts/SportsTradingContext';
import { OrderBook } from '@/app/components/OrderBook';
import { OddsChartV2 } from '@/app/components/charts/OddsChartV2';
import { TradingPanel } from '@/app/components/TradingPanel';

export function SportsTradingSidebar() {
  const { selectedEvent, isSidebarOpen, closeEvent } = useSportsTrading();
  
  if (!selectedEvent) return null;
  
  return (
    <AnimatePresence>
      {isSidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeEvent}
            className="fixed inset-0 bg-black/50 z-40"
          />
          
          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-full sm:w-[600px] bg-[#1a2332] z-50 shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#1a2332] p-4 border-b border-white/10 z-10">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  {selectedEvent.teamA && selectedEvent.teamB ? (
                    <h2 className="text-xl font-bold text-white">
                      {selectedEvent.teamA} vs {selectedEvent.teamB}
                    </h2>
                  ) : (
                    <h2 className="text-xl font-bold text-white line-clamp-2">
                      {selectedEvent.title}
                    </h2>
                  )}
                  {selectedEvent.league && (
                    <p className="text-sm text-white/50 mt-1">{selectedEvent.league}</p>
                  )}
                  {selectedEvent.live && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-bold text-red-400 uppercase">LIVE</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={closeEvent}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/70" />
                </button>
              </div>
              
              {/* Tabs */}
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium border border-blue-500/30">
                  Games
                </button>
                <button className="px-4 py-2 bg-white/5 text-white/50 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
                  Props
                </button>
              </div>
            </div>
            
            {/* Scrollable content */}
            <div className="overflow-y-auto h-[calc(100vh-140px)] p-4 space-y-6">
              {/* Order Book */}
              <div>
                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wide mb-3">
                  Order Book
                </h3>
                <OrderBook 
                  eventId={selectedEvent.id} 
                  dataSource="polymarket"
                  selectedOption="YES"
                  visualMode={true}
                />
              </div>
              
              {/* Odds Chart */}
              <div>
                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wide mb-3">
                  Odds History
                </h3>
                <OddsChartV2 
                  eventId={selectedEvent.id}
                  eventType={selectedEvent.type === 'MULTIPLE' ? 'MULTIPLE' : 'BINARY'}
                  outcomes={selectedEvent.outcomes || (selectedEvent.yesOdds && selectedEvent.noOdds ? [
                    { id: 'yes', name: 'YES', probability: selectedEvent.yesOdds },
                    { id: 'no', name: 'NO', probability: selectedEvent.noOdds }
                  ] : [])}
                  currentYesPrice={selectedEvent.yesOdds}
                />
              </div>
              
              {/* Trading Panel */}
              <div>
                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wide mb-3">
                  Place Your Bet
                </h3>
                <TradingPanel 
                  eventId={selectedEvent.id} 
                  variant="modal"
                  eventData={selectedEvent}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

