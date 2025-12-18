'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/app/components/Navbar';
import { SparklesCore as Sparks } from '@/components/ui/sparkles';
import { Footer } from '@/app/components/Footer';
import { SportsSidebar } from '@/app/components/sports/SportsSidebar';
import { LiveGamesList } from '@/app/components/sports/LiveGamesList';
import { FuturesGrid } from '@/app/components/sports/FuturesGrid';
import { SportsTradingProvider } from '@/contexts/SportsTradingContext';
import { SportsTradingSidebar } from '@/app/components/sports/SportsTradingSidebar';
import { motion } from 'framer-motion';
import type { SportsEvent } from '@/types/sports';
import { Menu, X } from 'lucide-react';

export default function SportsPage() {
  const [selectedSport, setSelectedSport] = useState('popular');
  const [selectedCategory, setSelectedCategory] = useState('SPORTS');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  
  // Fetch sports events from database (show all events - live and upcoming)
  const { data, isLoading, error } = useQuery<{
    events: SportsEvent[];
    total: number;
    hasMore: boolean;
  }>({
    queryKey: ['sports-events', selectedSport],
    queryFn: async () => {
      const params = new URLSearchParams({
        filter: 'all', // Show all events
        limit: '100',
      });
      
      if (selectedSport && selectedSport !== 'popular') {
        params.append('sport', selectedSport);
      }
      
      const res = await fetch(`/api/sports?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch sports events');
      }
      return res.json();
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 10000, // Poll every 10s for all events
  });
  
  const events = data?.events || [];
  
  // Calculate event counts by category for sidebar
  const { data: countsData } = useQuery({
    queryKey: ['sports-counts'],
    queryFn: async () => {
      const res = await fetch('/api/sports?filter=all&limit=1000');
      if (!res.ok) return { counts: {} };
      const data = await res.json();
      
      // Count events by sport/league
      const counts: Record<string, number> = {};
      data.events.forEach((event: SportsEvent) => {
        if (event.league) {
          const key = event.league.toLowerCase().replace(/\s+/g, '-');
          counts[key] = (counts[key] || 0) + 1;
        }
        if (event.sport) {
          const key = event.sport.toLowerCase().replace(/\s+/g, '-');
          counts[key] = (counts[key] || 0) + 1;
        }
        
        // Map to common sport IDs
        if (event.sport?.includes('Counter-Strike')) counts['cs2'] = (counts['cs2'] || 0) + 1;
        if (event.sport?.includes('League of Legends')) counts['lol'] = (counts['lol'] || 0) + 1;
        if (event.sport?.includes('Dota')) counts['dota2'] = (counts['dota2'] || 0) + 1;
        if (event.sport?.includes('Rocket League')) counts['rocket-league'] = (counts['rocket-league'] || 0) + 1;
        
        // Count esports and traditional
        if (event.isEsports) {
          counts['esports'] = (counts['esports'] || 0) + 1;
        } else {
          counts['football'] = (counts['football'] || 0) + 1;
        }
      });
      
      counts['popular'] = data.total;
      
      return { counts };
    },
    staleTime: 60000, // 1 minute
  });
  
  const eventCounts = countsData?.counts || {};
  
  // Connect to SSE for real-time odds updates
  useEffect(() => {
    // Connect for both live and upcoming events (not just live)
    const eventSource = new EventSource('/api/sports/live/stream');
    
    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        
        // Update the query cache with new odds
        queryClient.setQueryData(
          ['sports-events', selectedSport],
          (oldData: any) => {
            if (!oldData || !update.events) return oldData;
            
            // Create a map of updated events by ID
            const updatedEventsMap = new Map(
              update.events.map((e: SportsEvent) => [e.id, e])
            );
            
            // Update existing events with new odds
            const updatedEvents = oldData.events.map((event: SportsEvent) => {
              const updated = updatedEventsMap.get(event.id);
              if (updated) {
                return {
                  ...event,
                  yesOdds: updated.yesOdds,
                  noOdds: updated.noOdds,
                  score: updated.score,
                  period: updated.period,
                  elapsed: updated.elapsed,
                  live: updated.live,
                  gameStatus: updated.gameStatus,
                };
              }
              return event;
            });
            
            return {
              ...oldData,
              events: updatedEvents,
            };
          }
        );
      } catch (error) {
        console.error('Failed to parse SSE update:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };
    
    return () => {
      eventSource.close();
    };
  }, [selectedSport, queryClient]);
  
  // Handle category change from navbar
  const handleCategoryChange = (category: string) => {
    if (category === 'SPORTS') {
      // Stay on sports page
      setSelectedCategory('SPORTS');
    } else {
      // Navigate to main page with selected category
      router.push(`/?category=${category}`);
    }
  };
  
  return (
    <SportsTradingProvider>
      {/* Navbar with category subheader */}
      <Navbar 
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
      />
      
      {/* Background sparkles */}
      <div className="fixed inset-0 w-full h-full -z-10">
        <Sparks
          id="sports-particles"
          background="transparent"
          minSize={0.4}
          maxSize={1}
          particleDensity={50}
          className="w-full h-full"
          particleColor="#FFFFFF"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a2332] via-[#1a2332]/95 to-[#1a2332]" />
      </div>
      
      <div className="min-h-screen">
        <div className="flex">
          {/* Mobile Sidebar Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed top-20 left-4 z-50 lg:hidden bg-[#22303f] p-2 rounded-lg border border-white/10"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          {/* Sidebar - Desktop always visible, Mobile toggleable */}
          <div className={`
            fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] z-40 lg:z-0
            transform transition-transform duration-300 lg:transform-none
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}>
            <SportsSidebar
              selectedCategory={selectedSport}
              onSelectCategory={(sport) => {
                setSelectedSport(sport);
                setSidebarOpen(false); // Close on mobile after selection
              }}
              eventCounts={eventCounts}
            />
          </div>
          
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          
          {/* Main Content */}
          <div className="flex-1 min-w-0 px-4 sm:px-6 py-8">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  {selectedSport === 'popular' ? 'Popular' : selectedSport.toUpperCase()}
                </h1>
                <p className="text-white/50 text-sm">
                  Live games and upcoming matches
                </p>
              </div>
              
              {/* Loading State */}
              {isLoading && (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-32 bg-[#22303f] rounded-xl border border-white/5 animate-pulse"
                    />
                  ))}
                </div>
              )}
              
              {/* Error State */}
              {error && (
                <div className="text-center py-12">
                  <p className="text-red-400 mb-2">Failed to load sports events</p>
                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['sports-events'] })}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Try again
                  </button>
                </div>
              )}
              
              {/* Events Display */}
              {!isLoading && !error && (
                <LiveGamesList events={events} />
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <Footer />
      
      {/* Sliding Trading Sidebar */}
      <SportsTradingSidebar />
    </SportsTradingProvider>
  );
}
