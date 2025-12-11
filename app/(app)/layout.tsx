import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "../globals.css";
import { Providers } from "../providers";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const outfit = Outfit({
  subsets: ["latin"],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: "PolyBet | Decentralized Betting",
  description: "Bet on anything, pay with crypto.",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Providers>
        <div className="min-h-screen flex flex-col bg-transparent text-white relative z-10">
          <div className="flex-1 flex flex-col">
            {children}
          </div>
        </div>
      </Providers>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
