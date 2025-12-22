import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  // Compression is enabled by default in Next.js production builds
  // compress: true, // REMOVED: Redundant - Next.js compresses by default

  // Optimize package imports and enable parallel builds
  experimental: {
    optimizePackageImports: [
      '@prisma/client',
      'ioredis',
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
      'ethers',
      'recharts',
      'lucide-react',
      'date-fns',
    ],
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
};

export default withBundleAnalyzer(nextConfig);
