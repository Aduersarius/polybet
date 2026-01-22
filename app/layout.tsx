import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { DeferredScripts } from "./components/DeferredScripts";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { LaunchBanner } from "./components/LaunchBanner";

const outfit = Outfit({
  subsets: ["latin"],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: "Pariflow: Real-World Events Prediction Market",
  description: "Predict real-world events on Pariflow, a transparent prediction market that aggregates market signals to forecast outcomes across politics, economics and more.",
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

import { Toaster } from "@/components/ui/toaster";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <head>
        {/* Resource hints for critical domains */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        <link rel="dns-prefetch" href="https://vercel.live" />
        <link rel="dns-prefetch" href="https://vitals.vercel-insights.com" />
      </head>
      <body>
        <Providers>
          {/* Launch Banner - appears at the very top */}
          <LaunchBanner />
          <div className="min-h-screen flex flex-col bg-transparent text-white relative z-10 overflow-x-hidden">
            <div className="flex-1 flex flex-col overflow-x-hidden pb-14 md:pb-0">
              {children}
            </div>
            {/* Mobile Bottom Navigation */}
            <MobileBottomNav />
          </div>
          <Analytics />
          <SpeedInsights />
          <DeferredScripts />
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
