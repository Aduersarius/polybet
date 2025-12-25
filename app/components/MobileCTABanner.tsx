'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '@/lib/auth-client';

interface MobileCTABannerProps {
  onSignupClick: () => void;
}

export function MobileCTABanner({ onSignupClick }: MobileCTABannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    // Check if banner was previously dismissed
    const dismissed = sessionStorage.getItem('mobileBannerDismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      
      // Show banner after scrolling down 50px and keep it visible
      if (scrollPosition > 50 && !isVisible) {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          setIsVisible(true);
        }, 100);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isVisible]);

  // Only show on mobile devices
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      // Show on mobile devices (< 768px)
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem('mobileBannerDismissed', 'true');
  };

  // Only show for unauthenticated users
  const isAuthenticated = !!(session as any)?.user;
  
  if (!isMobile || isDismissed || isAuthenticated) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 260, 
            damping: 20,
            duration: 0.4 
          }}
          className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none"
        >
          {/* Banner Container */}
          <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-blue-500/20 shadow-[0_-4px_24px_rgba(59,130,246,0.15)] overflow-hidden pointer-events-auto backdrop-blur-xl">
            {/* Content */}
            <div className="px-4 py-3">
              {/* Main CTA Button */}
              <button
                onClick={() => {
                  onSignupClick();
                  handleDismiss();
                }}
                className="w-full mb-2 relative overflow-hidden"
              >
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-full px-5 py-2.5 shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 transition-all duration-300 active:scale-[0.98] hover:scale-[1.02]">
                  <div className="text-center">
                    <div className="text-white font-bold text-sm mb-0.5">
                      Make Your First Prediction
                    </div>
                    <div className="text-white/80 text-xs font-medium">
                      No credit card required
                    </div>
                  </div>
                </div>
              </button>

              {/* Trust Badge */}
              <div className="flex items-center justify-center gap-1.5">
                {/* Stars */}
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-3 h-3 fill-yellow-400"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                {/* Text */}
                <span className="text-white/80 text-xs font-medium">
                  Trusted by 7,000 traders
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

