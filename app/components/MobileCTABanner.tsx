'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '@/lib/auth-client';
import { LoginModal } from './auth/LoginModal';
import { SignupModal } from './auth/SignupModal';

export function MobileCTABanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { data: session } = useSession();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  useEffect(() => {
    // Check if banner was previously dismissed
    const dismissed = sessionStorage.getItem('mobileBannerDismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // Show after a small delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // Only show on mobile devices
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only show for unauthenticated users
  const isAuthenticated = !!(session as any)?.user;
  
  // Hide when modal is open
  const isModalOpen = showLoginModal || showSignupModal;
  
  if (!isMobile || isDismissed || isAuthenticated) return null;

  return (
    <>
      <AnimatePresence>
        {isVisible && !isModalOpen && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25,
            }}
            className="fixed bottom-14 left-0 right-0 z-[75] px-3 pb-2 pointer-events-none"
            style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="bg-[#0f1117]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 pointer-events-auto shadow-lg">
              {/* Login/Signup Buttons */}
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white text-sm font-semibold transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => setShowSignupModal(true)}
                  className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-xl text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20"
                >
                  Sign Up
                </button>
              </div>

              {/* Trust Badge */}
              <div className="flex items-center justify-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-2.5 h-2.5 fill-yellow-400"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                <span className="text-white/60 text-[11px] font-medium">
                  Trusted by 7,000+ traders
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSwitchToSignup={() => {
          setShowLoginModal(false);
          setShowSignupModal(true);
        }}
      />
      <SignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        onSwitchToLogin={() => {
          setShowSignupModal(false);
          setShowLoginModal(true);
        }}
      />
    </>
  );
}
