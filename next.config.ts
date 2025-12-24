import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from "@sentry/nextjs";

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
};

// Apply bundle analyzer
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

// Export with Sentry wrapper (single wrap, not double)
export default withSentryConfig(configWithAnalyzer, {
  org: "polybet",
  project: "sentry-green-window",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: "/monitoring",

  // Configure source maps
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Enable automatic instrumentation of Vercel Cron Monitors
  automaticVercelMonitors: true,

  // Webpack-specific options
  webpack: {
    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Remove Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
