import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  // Enable compression for better performance
  compress: true,

  // Force webpack instead of turbopack for compatibility
  experimental: {
    webpackBuildWorker: false,
    optimizePackageImports: ['@prisma/client', 'ioredis'],
  },
  webpack: (config) => {
    // Keep geoip-lite external so its data files remain available at runtime
    config.externals.push("pino-pretty", "lokijs", "encoding", "thread-stream", "geoip-lite");
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
  images: {
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

export default nextConfig;
