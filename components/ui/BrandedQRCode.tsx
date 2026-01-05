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
  const createQRConfig = useCallback((qrSize: number, imageSize: number = 0.2) => ({
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

  // Render expanded QR code when modal opens
  useEffect(() => {
    if (!QRCodeStyling || !isExpanded || !value) return;

    // Small delay to ensure ref is available
    const timer = setTimeout(() => {
      if (expandedQrRef.current) {
        expandedQrRef.current.innerHTML = '';
        const expandedQr = new QRCodeStyling(createQRConfig(320, 0.28));
        expandedQr.append(expandedQrRef.current);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [QRCodeStyling, value, isExpanded, createQRConfig]);

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
          style={{
            background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.98) 0%, rgba(18, 25, 38, 0.98) 100%)',
            padding: '12px',
            boxShadow: '0 0 30px rgba(16, 185, 129, 0.12), 0 0 60px rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {/* Inner glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 pointer-events-none" />

          {/* QR Code container */}
          <div
            ref={mainQrRef}
            className="relative rounded-lg overflow-hidden flex items-center justify-center"
            style={{
              width: size,
              height: size,
              background: 'linear-gradient(135deg, rgba(8, 12, 20, 0.95) 0%, rgba(12, 18, 28, 0.95) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          />

          {/* Corner accents */}
          <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-emerald-400/50 rounded-tl-md" />
          <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-emerald-400/50 rounded-tr-md" />
          <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-purple-400/50 rounded-bl-md" />
          <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-purple-400/50 rounded-br-md" />

          {/* Scan animation on hover */}
          {expandable && (
            <div
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          )}
        </div>

        {/* Click hint */}
        {expandable && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/25 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Click to expand
          </div>
        )}
      </div>

      {/* Expanded Modal */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md"
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative"
            >
              {/* Close button */}
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
              >
                <X className="w-5 h-5 text-white/70" />
              </button>

              {/* Expanded QR container */}
              <div
                className="relative rounded-xl overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.98) 0%, rgba(18, 25, 38, 0.98) 100%)',
                  padding: '16px',
                  boxShadow: '0 0 60px rgba(16, 185, 129, 0.2), 0 0 100px rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 pointer-events-none" />

                <div
                  ref={expandedQrRef}
                  className="relative rounded-lg overflow-hidden flex items-center justify-center"
                  style={{
                    width: 320,
                    height: 320,
                    background: 'linear-gradient(135deg, rgba(8, 12, 20, 0.95) 0%, rgba(12, 18, 28, 0.95) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                  }}
                />

                <div className="absolute top-2.5 left-2.5 w-5 h-5 border-l-2 border-t-2 border-emerald-400/50 rounded-tl-md" />
                <div className="absolute top-2.5 right-2.5 w-5 h-5 border-r-2 border-t-2 border-emerald-400/50 rounded-tr-md" />
                <div className="absolute bottom-2.5 left-2.5 w-5 h-5 border-l-2 border-b-2 border-purple-400/50 rounded-bl-md" />
                <div className="absolute bottom-2.5 right-2.5 w-5 h-5 border-r-2 border-b-2 border-purple-400/50 rounded-br-md" />
              </div>

              <p className="text-center mt-4 text-xs text-white/40">
                Scan with your wallet app
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
