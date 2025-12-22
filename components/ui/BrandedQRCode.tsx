'use client';

import { QRCodeSVG } from 'qrcode.react';
import Image from 'next/image';

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  logoSize?: number;
}

export function BrandedQRCode({ value, size = 220, logoSize = 50 }: BrandedQRCodeProps) {
  return (
    <div className="relative inline-block">
      <QRCodeSVG 
        value={value} 
        size={size}
        level="H" // High error correction to allow logo overlay
        includeMargin={true}
      />
      {/* Diamond logo overlay */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-2 shadow-lg"
        style={{ width: logoSize, height: logoSize }}
      >
        <Image
          src="/diamond_logo_nobg.png"
          alt="Polybet"
          width={logoSize - 16}
          height={logoSize - 16}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
