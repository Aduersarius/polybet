'use client';

interface CryptoIconProps {
  className?: string;
  size?: number;
}

export function USDCIcon({ className = "", size = 24 }: CryptoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="16" cy="16" r="16" fill="#2775CA"/>
      <path d="M20.5 18.5C20.5 15.5 18.5 14.5 15.5 14.25V11.75C16.75 12 17.5 12.75 17.75 14H20.25C20 11.75 18.5 10 16.5 9.5V7.5H14.5V9.5C12 10 10.5 11.5 10.5 13.5C10.5 16.5 12.5 17.5 15.5 17.75V20.25C14 20 13.25 19.25 13 18H10.5C10.75 20.25 12.25 22 14.5 22.5V24.5H16.5V22.5C19 22 20.5 20.5 20.5 18.5ZM14.5 12.75V14.5C13.75 14.25 13.25 14 13.25 13.25C13.25 12.5 13.75 12 14.5 11.75V12.75ZM16.5 20.25V18.5C17.25 18.75 17.75 19 17.75 19.75C17.75 20.5 17.25 21 16.5 21.25V20.25Z" fill="white"/>
    </svg>
  );
}

export function USDTIcon({ className = "", size = 24 }: CryptoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="16" cy="16" r="16" fill="#26A17B"/>
      <path d="M17.5 15.75V14.25H20V11.5H12V14.25H14.5V15.75C11.25 16 9 17.25 9 18.75C9 20.25 11.25 21.5 14.5 21.75V25.5H17.5V21.75C20.75 21.5 23 20.25 23 18.75C23 17.25 20.75 16 17.5 15.75ZM14.5 20C12.25 19.75 11 19 11 18.5C11 18 12.25 17.25 14.5 17V20ZM17.5 20V17C19.75 17.25 21 18 21 18.5C21 19 19.75 19.75 17.5 20Z" fill="white"/>
    </svg>
  );
}

export function PolygonIcon({ className = "", size = 24 }: CryptoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="32" height="32" rx="16" fill="#8247E5"/>
      <path d="M21.5 12.5L18.5 10.75C18.25 10.625 17.75 10.625 17.5 10.75L14.5 12.5L12.5 13.75L9.5 15.5C9.25 15.625 8.75 15.625 8.5 15.5L6.5 14.25C6.25 14.125 6 13.875 6 13.5V11.25C6 10.875 6.25 10.625 6.5 10.5L8.5 9.25C8.75 9.125 9.25 9.125 9.5 9.25L11.5 10.5C11.75 10.625 12 10.875 12 11.25V13L14 11.75V10C14 9.625 13.75 9.375 13.5 9.25L9.5 7C9.25 6.875 8.75 6.875 8.5 7L4.5 9.25C4.25 9.375 4 9.625 4 10V14.5C4 14.875 4.25 15.125 4.5 15.25L8.5 17.5C8.75 17.625 9.25 17.625 9.5 17.5L12.5 15.75L14.5 14.5L17.5 12.75C17.75 12.625 18.25 12.625 18.5 12.75L20.5 14C20.75 14.125 21 14.375 21 14.75V17C21 17.375 20.75 17.625 20.5 17.75L18.5 19C18.25 19.125 17.75 19.125 17.5 19L15.5 17.75C15.25 17.625 15 17.375 15 17V15.25L13 16.5V18.25C13 18.625 13.25 18.875 13.5 19L17.5 21.25C17.75 21.375 18.25 21.375 18.5 21.25L22.5 19C22.75 18.875 23 18.625 23 18.25V13.75C23 13.375 22.75 13.125 22.5 13L18.5 10.75L21.5 12.5Z" fill="white"/>
    </svg>
  );
}

export function EthereumIcon({ className = "", size = 24 }: CryptoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="16" cy="16" r="16" fill="#627EEA"/>
      <path d="M16 4L15.75 4.875V19.625L16 19.875L22.5 16L16 4Z" fill="white" fillOpacity="0.6"/>
      <path d="M16 4L9.5 16L16 19.875V4Z" fill="white"/>
      <path d="M16 21.375L15.875 21.5V26.375L16 26.75L22.5 17.5L16 21.375Z" fill="white" fillOpacity="0.6"/>
      <path d="M16 26.75V21.375L9.5 17.5L16 26.75Z" fill="white"/>
      <path d="M16 19.875L22.5 16L16 12.5V19.875Z" fill="white" fillOpacity="0.2"/>
      <path d="M9.5 16L16 19.875V12.5L9.5 16Z" fill="white" fillOpacity="0.6"/>
    </svg>
  );
}

export function BNBIcon({ className = "", size = 24 }: CryptoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
      <path d="M12 11L16 7L20 11L22 9L16 3L10 9L12 11Z" fill="white"/>
      <path d="M7 16L9 14L11 16L9 18L7 16Z" fill="white"/>
      <path d="M12 21L16 25L20 21L22 23L16 29L10 23L12 21Z" fill="white"/>
      <path d="M25 16L23 14L21 16L23 18L25 16Z" fill="white"/>
      <path d="M19 16L16 13L14.5 14.5L13 16L14.5 17.5L16 19L19 16Z" fill="white"/>
    </svg>
  );
}

export function ArbitrumIcon({ className = "", size = 24 }: CryptoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="16" cy="16" r="16" fill="#28A0F0"/>
      <path d="M20.5 11L16 6L11.5 11L8 16L11.5 21L16 26L20.5 21L24 16L20.5 11Z" fill="white" fillOpacity="0.9"/>
      <path d="M16 12L18.5 16L16 20L13.5 16L16 12Z" fill="#28A0F0"/>
      <path d="M16 6L13 10.5L16 12L19 10.5L16 6Z" fill="white" fillOpacity="0.6"/>
      <path d="M16 26L13 21.5L16 20L19 21.5L16 26Z" fill="white" fillOpacity="0.6"/>
    </svg>
  );
}

// Export a mapping for easy access
export const cryptoIcons = {
  'polygon-usdc': PolygonIcon,
  'ethereum-usdt': EthereumIcon,
  'bsc-usdt': BNBIcon,
  'arbitrum-usdc': ArbitrumIcon,
  usdc: USDCIcon,
  usdt: USDTIcon,
  polygon: PolygonIcon,
  ethereum: EthereumIcon,
  bnb: BNBIcon,
  arbitrum: ArbitrumIcon,
};
