import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "../globals.css";
import { Providers } from "../providers";

const outfit = Outfit({
  subsets: ["latin"],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'PolyBet Admin',
  description: 'Admin Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-black text-white">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
