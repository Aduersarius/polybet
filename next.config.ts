import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  // Optimize package imports (client-side only packages)
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-accordion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-icons',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
      '@tanstack/react-query',
      'recharts',
      'lucide-react',
      'date-fns',
    ],
    // Enable client trace metadata for Sentry
    clientTraceMetadata: ['baggage', 'sentry-trace'],
  },
  // Ensure geoip-lite data files are traced into the serverless output
  outputFileTracingIncludes: {
    '*': ['node_modules/geoip-lite/data/**'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'dummyimage.com',
      },
      {
        protocol: 'https',
        hostname: 'loremflickr.com',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content Security Policy - XSS protection
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + Vercel analytics + Sentry + blob for workers
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-scripts.com https://*.sentry.io blob:",
              // Workers: self + blob
              "worker-src 'self' blob:",
              // Styles: self + inline (required for styled-components/emotion) + Google Fonts
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Images: self + https + data URIs + blobs (for file uploads)
              "img-src 'self' https: data: blob:",
              // Fonts: self + Google Fonts
              "font-src 'self' https://fonts.gstatic.com data:",
              // Connect: self + https APIs + WebSockets + Sentry
              "connect-src 'self' https: wss: https://*.sentry.io",
              // Media: self + https
              "media-src 'self' https: blob:",
              // Object: none (blocks plugins like Flash)
              "object-src 'none'",
              // Frame ancestors: none (same as X-Frame-Options DENY)
              "frame-ancestors 'none'",
              // Base URI: self only
              "base-uri 'self'",
              // Form action: self only
              "form-action 'self'",
              // Upgrade insecure requests in production
              ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
            ].join('; '),
          },
          // HSTS - only in production
          ...(process.env.NODE_ENV === 'production'
            ? [
              {
                key: 'Strict-Transport-Security',
                value: 'max-age=31536000; includeSubDomains',
              },
            ]
            : []),
        ],
      },
      // Stricter headers for API routes
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },
};

// Apply bundle analyzer
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

// Export without Sentry wrapper to avoid build-time errors
// Sentry runtime monitoring still works via sentry.*.config.ts files
export default configWithAnalyzer;
