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
    },
};

export default function LandingLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={outfit.variable} suppressHydrationWarning>
            <body suppressHydrationWarning>
                <Providers>
                    {children}
                </Providers>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
