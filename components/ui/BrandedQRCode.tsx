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
      {/* Outer glow container with enhanced styling */}
      <div 
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 24, 39, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
          padding: '28px',
          boxShadow: '0 0 60px rgba(16, 185, 129, 0.2), 0 0 120px rgba(139, 92, 246, 0.15), inset 0 0 40px rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Inner glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        {/* QR Code with dark theme - no white background */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0f172a]/95 to-[#1e293b]/95 backdrop-blur-sm p-4 border border-white/10">
          <QRCodeSVG 
            value={value} 
            size={size - 64} // Account for padding
            level="H" // High error correction for logo
            bgColor="transparent"
            fgColor="#ffffff"
            style={{
              width: '100%',
              height: '100%',
            }}
          />
          
          {/* Decorative corner accents with glow */}
          <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-emerald-400/50 rounded-tl-lg shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
          <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-emerald-400/50 rounded-tr-lg shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
          <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-purple-400/50 rounded-bl-lg shadow-[0_0_8px_rgba(139,92,246,0.3)]" />
          <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-purple-400/50 rounded-br-lg shadow-[0_0_8px_rgba(139,92,246,0.3)]" />
        </div>

        {/* Diamond logo in center with premium styling - lower z-index to not cover dropdowns */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1]"
          style={{ 
            width: logoSize + 16, 
            height: logoSize + 16,
          }}
        >
          {/* Logo glow */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-purple-400/20 blur-xl" />
          
          {/* Logo container with dark theme */}
          <div 
            className="relative w-full h-full rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 24, 39, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 0 20px rgba(16, 185, 129, 0.1)',
              padding: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
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

