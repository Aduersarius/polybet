'use client';

import { QRCodeSVG } from 'qrcode.react';
import Image from 'next/image';

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  logoSize?: number;
}

export function BrandedQRCode({ value, size = 280, logoSize = 70 }: BrandedQRCodeProps) {
  return (
    <div className="relative inline-block">
      {/* Outer glow container */}
      <div 
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 24, 39, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
          padding: '24px',
          boxShadow: '0 0 40px rgba(16, 185, 129, 0.15), 0 0 80px rgba(139, 92, 246, 0.1)',
        }}
      >
        {/* Inner glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        {/* QR Code with custom styling */}
        <div className="relative rounded-2xl overflow-hidden bg-white/95 backdrop-blur-sm p-4">
          <QRCodeSVG 
            value={value} 
            size={size - 64} // Account for padding
            level="H" // High error correction for logo
            bgColor="transparent"
            fgColor="#1a1f2e"
            style={{
              width: '100%',
              height: '100%',
            }}
          />
          
          {/* Decorative corner accents */}
          <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-emerald-400/30 rounded-tl-lg" />
          <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-emerald-400/30 rounded-tr-lg" />
          <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-purple-400/30 rounded-bl-lg" />
          <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-purple-400/30 rounded-br-lg" />
        </div>

        {/* Diamond logo in center with premium styling */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ 
            width: logoSize + 16, 
            height: logoSize + 16,
          }}
        >
          {/* Logo glow */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-purple-400/20 blur-xl" />
          
          {/* Logo container */}
          <div 
            className="relative w-full h-full rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 250, 251, 0.98) 100%)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              padding: '12px',
            }}
          >
            <Image
              src="/diamond_logo_nobg.png"
              alt="PolyBet"
              width={logoSize}
              height={logoSize}
              className="w-full h-full object-contain drop-shadow-sm"
              priority
            />
          </div>
        </div>

        {/* Scan indicator */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent rounded-full" />
      </div>

      {/* Outer decorative ring */}
      <div 
        className="absolute -inset-1 rounded-3xl pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(139, 92, 246, 0.1))',
          filter: 'blur(8px)',
          zIndex: -1,
        }}
      />
    </div>
  );
}
