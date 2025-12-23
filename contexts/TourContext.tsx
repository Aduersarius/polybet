'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo, memo } from 'react';
import Joyride, { Step, CallBackProps, STATUS, ACTIONS, EVENTS } from 'react-joyride';
import { usePathname, useRouter } from 'next/navigation';

interface TourContextType {
  startTour: () => void;
  skipTour: () => void;
  resetTour: () => void;
  currentStep: number;
  isActive: boolean;
  completeTour: () => void;
}

const TourContext = createContext<TourContextType | null>(null);

const TOUR_STORAGE_KEY = 'polybet-tour-completed';
const TOUR_STEP_KEY = 'polybet-tour-step';
const FIRST_VISIT_KEY = 'polybet-first-visit';

// Memoized Joyride component to prevent unnecessary re-renders
const MemoizedJoyride = memo(({ 
  steps, 
  run, 
  stepIndex, 
  callback 
}: { 
  steps: Step[], 
  run: boolean, 
  stepIndex: number, 
  callback: (data: CallBackProps) => void 
}) => {
  console.log('🎨 Joyride rendering with stepIndex:', stepIndex, 'run:', run);
  
  if (!run) {
    console.log('❌ Joyride not running, skipping render');
    return null;
  }
  
  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      scrollToFirstStep={false}
      disableScrolling={true}
      disableOverlayClose={true}
      spotlightPadding={10}
      disableCloseOnEsc={false}
      hideCloseButton={false}
      spotlightClicks={false}
      disableScrollParentFix={true}
      hideBackButton={false}
      floaterProps={{
        disableAnimation: true,
      }}
      styles={{
        beacon: {
          display: 'none',
        },
        beaconInner: {
          display: 'none',
        },
        beaconOuter: {
          display: 'none',
        },
        options: {
          primaryColor: '#3b82f6',
          zIndex: 10000,
          arrowColor: '#1a1f2e',
          backgroundColor: '#1a1f2e',
          textColor: '#ffffff',
        },
        tooltip: {
          backgroundColor: '#1a1f2e',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.2)',
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#3b82f6',
          borderRadius: '8px',
          padding: '8px 16px',
        },
        buttonBack: {
          color: '#94a3b8',
          marginRight: '8px',
        },
        buttonSkip: {
          color: '#64748b',
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip tour',
      }}
      callback={callback}
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.run === nextProps.run &&
    prevProps.stepIndex === nextProps.stepIndex &&
    prevProps.steps === nextProps.steps
  );
});

// Define all tour steps with page context
const allSteps: (Step & { page?: string; requiresAuth?: boolean })[] = [
  // Homepage Introduction
  {
    target: 'body',
    content: (
      <div className="space-y-3">
        <h3 className="text-xl font-bold text-white">👋 Welcome to Polybet!</h3>
        <p className="text-sm text-white/80">
          Let's take a quick interactive tour to show you how prediction markets work. 
          This will only take a minute!
        </p>
        <p className="text-xs text-white/60">
          You can skip anytime or restart later from your profile menu.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
    disableScrolling: true,
    page: '/',
  },
  {
    target: '.grid.grid-cols-1 > a[href^="/event/"]',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">📊 Prediction Markets</h4>
        <p className="text-sm text-white/80">
          These are events you can trade on. Each shows the current odds (market confidence) 
          and trading volume. Click any event to see more details!
        </p>
      </div>
    ),
    placement: 'bottom',
    disableBeacon: true,
    spotlightClicks: false,
    page: '/',
  },
  {
    target: '.category-nav',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">🏷️ Browse Categories</h4>
        <p className="text-sm text-white/80">
          Filter events by category: Sports, Politics, Crypto, and more. 
          Find markets that interest you!
        </p>
      </div>
    ),
    placement: 'bottom',
    disableBeacon: true,
    page: '/',
  },
  {
    target: '.search-bar',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">🔍 Search Events</h4>
        <p className="text-sm text-white/80">
          Looking for something specific? Use search to find events by keywords.
        </p>
      </div>
    ),
    placement: 'bottom',
    disableBeacon: true,
    page: '/',
  },
  {
    target: '.grid.grid-cols-1 > a[href^="/event/"] button svg',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">❤️ Save Favorites</h4>
        <p className="text-sm text-white/80">
          Click the heart icon on any event card to save markets you want to track. 
          Access them quickly from the Favorites tab!
        </p>
      </div>
    ),
    placement: 'top',
    disableBeacon: true,
    page: '/',
  },
  {
    target: '.deposit-button',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">💰 Deposit Funds</h4>
        <p className="text-sm text-white/80">
          To start trading, deposit USDC on Polygon network. Fast, cheap, and secure!
        </p>
      </div>
    ),
    placement: 'bottom',
    disableBeacon: true,
    page: '/',
    requiresAuth: true,
  },
  // Event Page Steps
  {
    target: '.trading-panel',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">🎯 Trading Panel</h4>
        <p className="text-sm text-white/80">
          This is where you place trades! Choose YES or NO, enter your amount, and click the trade button.
        </p>
        <div className="text-xs text-white/60 mt-2">
          💡 Start with small amounts to learn how it works!
        </div>
      </div>
    ),
    placement: 'left',
    page: '/event',
  },
  {
    target: '.outcome-selector',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">✅ Choose Outcome</h4>
        <p className="text-sm text-white/80">
          Select YES if you think the event will happen, or NO if you don't. The percentages show current market confidence.
        </p>
      </div>
    ),
    placement: 'top',
    page: '/event',
  },
  {
    target: '.amount-input',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">💵 Enter Amount</h4>
        <p className="text-sm text-white/80">
          Enter how much you want to trade. Minimum is $0.10, maximum is $10,000.
        </p>
        <div className="text-xs text-white/60 mt-2">
          The payout shows how many shares you'll receive!
        </div>
      </div>
    ),
    placement: 'top',
    page: '/event',
  },
  {
    target: '.order-book-section',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">📖 Order Book</h4>
        <p className="text-sm text-white/80">
          See all active limit orders here. Green = buy orders, Red = sell orders. Click any order to fill it instantly!
        </p>
      </div>
    ),
    placement: 'right',
    page: '/event',
  },
  {
    target: '.odds-chart',
    content: (
      <div className="space-y-2">
        <h4 className="font-semibold text-white">📈 Odds Chart</h4>
        <p className="text-sm text-white/80">
          Watch how probabilities change over time. This helps you spot trends and make better predictions!
        </p>
      </div>
    ),
    placement: 'top',
    page: '/event',
  },
  {
    target: 'body',
    content: (
      <div className="space-y-3">
        <h3 className="text-xl font-bold text-white">🎉 Tour Complete!</h3>
        <p className="text-sm text-white/80">
          You're all set! Start exploring markets and placing your first trades.
        </p>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-3">
          <p className="text-xs text-blue-300">
            💡 <strong>Pro tips:</strong>
          </p>
          <ul className="text-xs text-blue-200 mt-1 space-y-1">
            <li>• Sell anytime to lock in profits or cut losses</li>
            <li>• Watch the order book for better entry prices</li>
            <li>• Start small and learn as you go</li>
            <li>• Check FAQ if you have questions</li>
          </ul>
        </div>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
    page: '/',
  },
];

export function TourProvider({ children }: { children: ReactNode }) {
  const [runTour, setRunTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  
  // Keep track of previous runTour value to detect unexpected changes
  const prevRunTourRef = useRef(runTour);
  
  useEffect(() => {
    if (prevRunTourRef.current !== runTour) {
      console.log('🔄 runTour changed:', prevRunTourRef.current, '->', runTour, '| Step:', stepIndex);
      const stack = new Error().stack;
      console.log('📍 Change triggered from:', stack?.split('\n')[2]);
      prevRunTourRef.current = runTour;
    }
  }, [runTour, stepIndex]);

  // Initialize on mount
  useEffect(() => {
    setMounted(true);
    
    if (typeof window !== 'undefined') {
      const tourCompleted = localStorage.getItem(TOUR_STORAGE_KEY);
      const savedStep = localStorage.getItem(TOUR_STEP_KEY);
      const isFirstVisit = !localStorage.getItem(FIRST_VISIT_KEY);

      // If first visit and tour not completed, start tour after delay
      if (isFirstVisit && !tourCompleted) {
        localStorage.setItem(FIRST_VISIT_KEY, 'true');
        
        // Start tour after page content loads
        const startTourWhenReady = () => {
          const startTime = Date.now();
          
          // Wait for at least one event card to be rendered
          const checkInterval = setInterval(() => {
            const hasEventCards = document.querySelector('.grid > a[href^="/event/"]');
            const hasContent = hasEventCards || document.querySelectorAll('[href^="/event/"]').length > 0;
            
            const elapsed = Date.now() - startTime;
            
            if (hasContent) {
              console.log('✅ Content ready, starting tour after', elapsed, 'ms');
              clearInterval(checkInterval);
              setRunTour(true);
              setStepIndex(0);
            } else if (elapsed > 10000) {
              console.log('⏱️ Timeout reached, starting tour anyway');
              clearInterval(checkInterval);
              setRunTour(true);
              setStepIndex(0);
            }
          }, 500);
        };
        
        // Delay initial check
        setTimeout(startTourWhenReady, 3000);
      } else if (savedStep && !tourCompleted) {
        // Resume tour from saved step
        setStepIndex(parseInt(savedStep, 10));
      }
    }
  }, []);

  // Filter steps based on current page and auth status
  const filteredSteps = useMemo(() => {
    // Return all steps - Joyride will handle missing targets with our callback
    return allSteps.map(({ page, requiresAuth, ...step }) => step);
  }, []);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { status, action, index, type } = data;

    console.log('🎯 Callback:', { status, action, index, type });

    // Handle tour completion
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      console.log('✅ Tour ended:', status);
      setRunTour(false);
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      localStorage.removeItem(TOUR_STEP_KEY);
      setStepIndex(0);
      return;
    }

    // Handle step navigation
    if (type === EVENTS.STEP_AFTER && status === STATUS.RUNNING) {
      if (action === ACTIONS.NEXT) {
        const nextIndex = index + 1;
        if (nextIndex < allSteps.length) {
          console.log('➡️ Moving to step', nextIndex);
          setStepIndex(nextIndex);
          localStorage.setItem(TOUR_STEP_KEY, String(nextIndex));
        } else {
          console.log('🎉 Tour complete!');
          setRunTour(false);
          localStorage.setItem(TOUR_STORAGE_KEY, 'true');
          localStorage.removeItem(TOUR_STEP_KEY);
        }
      } else if (action === ACTIONS.PREV) {
        const prevIndex = index - 1;
        if (prevIndex >= 0) {
          console.log('⬅️ Moving to step', prevIndex);
          setStepIndex(prevIndex);
          localStorage.setItem(TOUR_STEP_KEY, String(prevIndex));
        }
      }
    }

    // Handle target not found - skip to next available step
    if (type === EVENTS.TARGET_NOT_FOUND) {
      console.warn('⚠️ Target not found for step', index);
      const nextIndex = index + 1;
      if (nextIndex < allSteps.length) {
        console.log('🔄 Skipping to step', nextIndex);
        setStepIndex(nextIndex);
      } else {
        console.log('❌ No more steps');
        setRunTour(false);
        localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      }
    }
  }, []);

  // Helper function to find the next available step with a valid target
  const findNextAvailableStep = (startIndex: number): number => {
    console.log('🔍 Looking for next available step starting from', startIndex);
    for (let i = startIndex; i < allSteps.length; i++) {
      const step = allSteps[i];
      const target = step.target as string;
      
      if (target === 'body') {
        console.log('✅ Found body target at step', i);
        return i;
      }
      
      const element = document.querySelector(target);
      if (element) {
        console.log('✅ Found target', target, 'at step', i);
        return i;
      } else {
        console.log('❌ Target not found:', target);
      }
    }
    console.log('❌ No available steps found');
    return -1;
  };

  const startTour = useCallback(() => {
    console.log('🚀 Starting tour manually');
    // Reset and restart tour
    localStorage.removeItem(TOUR_STORAGE_KEY);
    localStorage.removeItem(TOUR_STEP_KEY);
    setStepIndex(0);
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      console.log('▶️ Tour running: true, step: 0');
      setRunTour(true);
    }, 100);
  }, []);

  const skipTour = useCallback(() => {
    setRunTour(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    localStorage.removeItem(TOUR_STEP_KEY);
    setStepIndex(0);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    localStorage.removeItem(TOUR_STEP_KEY);
    setStepIndex(0);
    setRunTour(false);
  }, []);

  const completeTour = useCallback(() => {
    setRunTour(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    localStorage.removeItem(TOUR_STEP_KEY);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <TourContext.Provider
      value={{
        startTour,
        skipTour,
        resetTour,
        currentStep: stepIndex,
        isActive: runTour,
        completeTour,
      }}
    >
      {/* DISABLED - Tour replaced with SupportChatWidget */}
      {/* <MemoizedJoyride
        steps={filteredSteps}
        run={runTour}
        stepIndex={stepIndex}
        callback={handleJoyrideCallback}
      /> */}
      {children}
    </TourContext.Provider>
  );
}

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within TourProvider');
  }
  return context;
};

