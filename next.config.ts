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
    optimizePackageImports: ['@prisma/client', 'ioredis'],
  },
  // Ensure geoip-lite data files are traced into the serverless output
  outputFileTracingIncludes: {
    '*': ['node_modules/geoip-lite/data/**'],
  },
  webpack: (config, { isServer }) => {
    // Externalize dev-only and non-essential dependencies to reduce bundle size
    // These are transitive dependencies that shouldn't be bundled
    if (isServer) {
      // Only externalize on server-side (API routes)
      // Ensure externals is an array before pushing
      if (!Array.isArray(config.externals)) {
        config.externals = [];
      }
      const externalsToAdd = ["pino-pretty", "lokijs", "encoding", "thread-stream"];
      externalsToAdd.forEach((pkg) => {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg);
        }
      });
    }
    
    // Prevent React Native packages from being bundled (if accidentally imported)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    
    return config;
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
