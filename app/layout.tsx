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
            { url: '/diamond_logo_nobg.png', type: 'image/png' },
        ],
        apple: '/diamond_logo_nobg.png',
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