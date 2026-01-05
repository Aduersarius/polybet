'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  expandable?: boolean;
}

export function BrandedQRCode({ value, size = 240, expandable = true }: BrandedQRCodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const mainQrRef = useRef<HTMLDivElement>(null);
  const expandedQrRef = useRef<HTMLDivElement>(null);
  const [QRCodeStyling, setQRCodeStyling] = useState<any>(null);
  const mainQrInstance = useRef<any>(null);

  // Dynamically import qr-code-styling (it's not SSR compatible)
  useEffect(() => {
    import('qr-code-styling').then((module) => {
      setQRCodeStyling(() => module.default);
    });
  }, []);

  // Create QR code config
  const createQRConfig = useCallback((qrSize: number, imageSize: number = 0.08) => ({
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
      color: '#1a3c9cff',
      type: 'dot' as const,
    },
    backgroundOptions: {
      color: 'transparent',
    },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 0, // Minimal margin for tighter integration
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
        className={`relative inline-block ${expandable ? 'cursor-pointer group' : ''}`}
        onClick={() => expandable && setIsExpanded(true)}
      >
        {/* Outer container */}
        <div
          className="relative rounded-xl overflow-hidden transition-all duration-300"
        >
          {/* QR Code container */}
          <div
            ref={mainQrRef}
            className="relative rounded-lg overflow-hidden flex items-center justify-center"
            style={{
              width: size,
              height: size,
              background: 'linear-gradient(135deg, rgba(8, 12, 20, 0.5) 0%, rgba(12, 18, 28, 0.5) 100%)',
            }}
          />

          {/* Scan animation on hover */}
          {expandable && (
            <div
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          )}
        </div>

        {/* Click hint */}
        {expandable && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-white/0 group-hover:text-white/25 transition-all whitespace-nowrap pointer-events-none">
            Click to expand
          </div>
        )}
      </div>

      {/* Full Screen Expanded Modal */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
            onClick={() => setIsExpanded(false)}
          >
            {/* Close button - top right */}
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-6 h-6 text-white/70" />
            </button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center"
            >
              {/* QR Code - fills screen */}
              <div
                ref={expandedQrRef}
                className="relative rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  width: fullscreenSize,
                  height: fullscreenSize,
                  background: 'linear-gradient(135deg, rgba(8, 12, 20, 0.8) 0%, rgba(12, 18, 28, 0.8) 100%)',
                }}
              />

              <p className="text-center mt-6 text-sm text-white/50">
                Tap anywhere to close
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
