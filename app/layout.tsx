import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toaster";
import { DevSwCleanup } from "./components/DevSwCleanup";
import { OnboardingLauncher } from "./components/OnboardingLauncher";
import { SupportChatWidget } from "./components/support/SupportChatWidget";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const outfit = Outfit({
    subsets: ["latin"],
    variable: '--font-outfit',
    weight: ['200', '300', '400', '500', '600', '700', '800', '900'], // Include all weights for title
});

export const metadata: Metadata = {
    title: "Pariflow | Real-Life Market Forecasting",
    description: "Bet on anything, pay with crypto.",
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/icon-trans-48.png', type: 'image/png', sizes: '48x48' },
            { url: '/icon-trans-96.png', type: 'image/png', sizes: '96x96' },
            { url: '/icon-trans-144.png', type: 'image/png', sizes: '144x144' },
            { url: '/icon-trans-192.png', type: 'image/png', sizes: '192x192' },
            { url: '/icon-trans-512.png', type: 'image/png', sizes: '512x512' },
        ],
        apple: [
            { url: '/icon-trans-192.png', sizes: '192x192', type: 'image/png' },
        ],
    },
    openGraph: {
        title: "Pariflow | Real-Life Market Forecasting",
        description: "Bet on anything, pay with crypto. Trade on real-world events and profit from your predictions.",
        url: "https://pariflow.com",
        siteName: "Pariflow",
        images: [
            {
                url: "https://pariflow.com/og-image.png",
                width: 1200,
                height: 630,
                alt: "Pariflow - Prediction Market Platform",
            },
        ],
        locale: "en_US",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Pariflow | Real-Life Market Forecasting",
        description: "Bet on anything, pay with crypto. Trade on real-world events and profit from your predictions.",
        images: ["https://pariflow.com/og-image.png"],
        creator: "@pariflow",
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
                    <SupportChatWidget />
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm pointer-events-none z-[1]" />
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