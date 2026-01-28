'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const mentions = [
    {
        name: 'Yahoo Finance',
        logo: '/logos/yahoo-finance.svg',
        url: 'https://finance.yahoo.com',
    },
    {
        name: 'Finextra',
        logo: '/logos/finextra.svg',
        url: 'https://www.finextra.com',
    },
    {
        name: 'Binance',
        logo: '/logos/binance.svg',
        url: 'https://www.binance.com',
    },
];

export function MentionedIn() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-6"
        >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 py-4 px-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Mentioned in
                </span>
                <div className="flex items-center gap-6 sm:gap-10">
                    {mentions.map((mention, index) => (
                        <motion.a
                            key={mention.name}
                            href={mention.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 + index * 0.1 }}
                            className="group flex items-center justify-center opacity-50 hover:opacity-100 transition-all duration-300 grayscale hover:grayscale-0"
                        >
                            <Image
                                src={mention.logo}
                                alt={mention.name}
                                width={120}
                                height={32}
                                className="h-5 sm:h-6 w-auto object-contain"
                                unoptimized
                            />
                        </motion.a>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
