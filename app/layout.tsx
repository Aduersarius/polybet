import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SparklesCore as Sparks } from "../components/ui/sparkles";
import { Toaster } from "@/components/ui/toaster";
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
        <html lang="en" className={outfit.variable} suppressHydrationWarning>
            <body suppressHydrationWarning className="bg-[#0a0a0a] min-h-screen text-white">
                <Providers>
                    <Sparks
                        id="tsparticlesfullpage"
                        background="transparent"
                        minSize={0.6}
                        maxSize={1.4}
                        particleDensity={100}
                        className="w-full h-full"
                        particleColor="#FFFFFF"
                    />
                    <div className="relative z-10 min-h-screen flex flex-col">
                        {children}
                    </div>
                    <Toaster />
                </Providers>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}