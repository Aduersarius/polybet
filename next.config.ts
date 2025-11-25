import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable compression for better performance
  compress: true,

  // Force webpack instead of turbopack for compatibility
  experimental: {
    webpackBuildWorker: false,
    optimizePackageImports: ['@prisma/client', 'ioredis', '@upstash/ratelimit'],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding", "thread-stream");
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
    ],
  },
};

export default nextConfig;
