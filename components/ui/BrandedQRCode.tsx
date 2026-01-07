'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  expandable?: boolean;
}

export function BrandedQRCode({ value, size = 240, expandable = true }: BrandedQRCodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mainQrRef = useRef<HTMLDivElement>(null);
  const expandedQrRef = useRef<HTMLDivElement>(null);
  const [QRCodeStyling, setQRCodeStyling] = useState<any>(null);
  const mainQrInstance = useRef<any>(null);

  // Dynamically import qr-code-styling (it's not SSR compatible)
  useEffect(() => {
    setMounted(true);
    import('qr-code-styling').then((module) => {
      setQRCodeStyling(() => module.default);
    });
  }, []);

  // Create QR code config
  const createQRConfig = useCallback((qrSize: number, imageSize: number = 0.15) => ({
    width: qrSize,
    height: qrSize,
    type: 'svg' as const,
    data: value,
    image: '/diamond_logo_nobg.png',
    dotsOptions: {
      color: '#ffffff',
      type: 'dots' as const,
    },
    cornersSquareOptions: {
      color: '#ffffff',
      type: 'extra-rounded' as const,
    },
    cornersDotOptions: {
      color: '#ffffff',
      type: 'dot' as const,
    },
    backgroundOptions: {
      color: 'transparent',
    },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 0, // Minimal margin to fit logo size as requested
      imageSize: imageSize,
      hideBackgroundDots: true,
    },
    qrOptions: {
      errorCorrectionLevel: 'H' as const,
    },
  }), [value]);

  // Render main QR code
  useEffect(() => {
    if (!QRCodeStyling || !mainQrRef.current || !value) return;

    // Clear and create new instance
    mainQrRef.current.innerHTML = '';
    mainQrInstance.current = new QRCodeStyling(createQRConfig(size));
    mainQrInstance.current.append(mainQrRef.current);

    // Cleanup on unmount
    return () => {
      mainQrInstance.current = null;
    };
  }, [QRCodeStyling, value, size, createQRConfig]);

  // Calculate fullscreen QR size
  const [fullscreenSize, setFullscreenSize] = useState(320);

  useEffect(() => {
    const updateSize = () => {
      // Use 80% of the smaller viewport dimension, capped at 600px
      const size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
      setFullscreenSize(Math.min(Math.floor(size), 600));
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Render expanded QR code when modal opens
  useEffect(() => {
    if (!QRCodeStyling || !isExpanded || !value) return;

    // Small delay to ensure ref is available
    const timer = setTimeout(() => {
      if (expandedQrRef.current) {
        expandedQrRef.current.innerHTML = '';
        const expandedQr = new QRCodeStyling(createQRConfig(fullscreenSize, 0.08));
        expandedQr.append(expandedQrRef.current);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [QRCodeStyling, value, isExpanded, createQRConfig, fullscreenSize]);

  return (
    <>
      {/* Main QR Code (always rendered) */}
      <div
        className={`flex flex-col items-center ${expandable ? 'cursor-pointer group' : ''}`}
        onClick={() => expandable && setIsExpanded(true)}
      >
        {/* Outer container */}
        <div
          className="relative rounded-xl overflow-hidden transition-transform duration-300 group-hover:scale-[1.02]"
        >
          {/* QR Code container */}
          <div
            ref={mainQrRef}
            className="relative rounded-lg overflow-hidden flex items-center justify-center"
            style={{
              width: size,
              height: size,
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
            }}
          />
        </div>

        {/* Click hint - below the QR code */}
        {expandable && (
          <p className="text-center mt-2 text-xs text-white/40 font-medium">
            Click to expand
          </p>
        )}
      </div>

      {/* Full Screen Expanded Modal - Portaled to Body */}
      {mounted && createPortal(
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md"
              onClick={() => setIsExpanded(false)}
            >
              {/* Close button - top right */}
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute top-6 right-6 p-4 rounded-full bg-white/5 hover:bg-white/10 transition-colors z-[100000]"
              >
                <X className="w-8 h-8 text-white/70" />
              </button>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center"
              >
                {/* QR Code - fills screen */}
                <div
                  ref={expandedQrRef}
                  className="relative rounded-3xl overflow-hidden flex items-center justify-center p-4"
                  style={{
                    width: fullscreenSize + 32,
                    height: fullscreenSize + 32,
                    background: 'linear-gradient(145deg, rgba(15, 20, 30, 0.98) 0%, rgba(5, 8, 15, 0.98) 100%)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                />

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center mt-8 text-sm text-white/40 font-medium tracking-widest uppercase"
                >
                  Tap anywhere to close
                </motion.p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
