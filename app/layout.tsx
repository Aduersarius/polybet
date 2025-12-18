import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SparklesCore as Sparks } from "../components/ui/sparkles";
import { Toaster } from "@/components/ui/toaster";
import { DevSwCleanup } from "./components/DevSwCleanup";
import { OnboardingLauncher } from "./components/OnboardingLauncher";
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
            <body suppressHydrationWarning className="min-h-screen text-white">
                <Providers>
                    <DevSwCleanup />
                    <OnboardingLauncher />
                    <Sparks
                        id="tsparticlesfullpage"
                        background="transparent"
                        minSize={0.4}
                        maxSize={0.8}
                        particleDensity={20}
                        className="w-full h-full"
                        particleColor="#3b82f6"
                    />
                    <div className="fixed inset-0 bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419] pointer-events-none z-[1]" />
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