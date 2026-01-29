'use client';

import { motion } from 'framer-motion';

// Monochrome logo components - clean and professional
function YahooFinanceLogo() {
    return (
        <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                <path d="M12.003 2C6.478 2 2 6.478 2 12.003c0 5.524 4.478 10.002 10.003 10.002 5.524 0 10.002-4.478 10.002-10.002C22.005 6.478 17.527 2 12.003 2zM8.3 7.8h1.9l1.8 3.8 1.8-3.8h1.9L12.5 14v3.2h-1.8V14L8.3 7.8z"/>
            </svg>
            <span className="text-base font-semibold tracking-tight">Yahoo Finance</span>
        </div>
    );
}

function FinextraLogo() {
    return (
        <div className="flex items-center">
            <span className="text-base font-bold tracking-tight">finextra</span>
        </div>
    );
}

function BinanceLogo() {
    return (
        <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M12 2L6.5 7.5 8.5 9.5 12 6 15.5 9.5 17.5 7.5 12 2zM4 10L2 12l2 2 2-2-2-2zm16 0l-2 2 2 2 2-2-2-2zM12 10l-2 2 2 2 2-2-2-2zm0 8l-3.5-3.5-2 2L12 22l5.5-5.5-2-2L12 18z"/>
            </svg>
            <span className="text-base font-semibold tracking-tight">Binance</span>
        </div>
    );
}

function RedditLogo() {
    return (
        <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
            </svg>
            <span className="text-base font-semibold tracking-tight">Reddit</span>
        </div>
    );
}

function MediumLogo() {
    return (
        <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
            </svg>
            <span className="text-base font-semibold tracking-tight">Medium</span>
        </div>
    );
}

const mentions = [
    { name: 'Yahoo Finance', component: YahooFinanceLogo },
    { name: 'Binance', component: BinanceLogo },
    { name: 'Finextra', component: FinextraLogo },
    { name: 'Reddit', component: RedditLogo },
    { name: 'Medium', component: MediumLogo },
];

export function MentionedIn() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-6"
        >
            <div className="flex items-center gap-6">
                {/* Title - Left aligned */}
                <p className="text-xs text-gray-500 font-medium uppercase tracking-widest whitespace-nowrap shrink-0">
                    People talk about us
                </p>
                
                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-white/10 to-transparent w-12 shrink-0 hidden sm:block" />
                
                {/* Marquee container */}
                <div className="flex-1 overflow-hidden">
                    {/* Scrolling logos - using CSS animation with GPU acceleration */}
                    <div className="marquee-track">
                        {/* Render 4 sets for extra smooth looping */}
                        {[0, 1, 2, 3].map((setIndex) => (
                            <div key={setIndex} className="flex items-center gap-12 shrink-0 pr-12">
                                {mentions.map((mention) => {
                                    const LogoComponent = mention.component;
                                    return (
                                        <div
                                            key={`${mention.name}-${setIndex}`}
                                            className="text-white/30 shrink-0"
                                        >
                                            <LogoComponent />
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* CSS for smooth marquee animation */}
            <style jsx>{`
                .marquee-track {
                    display: flex;
                    width: max-content;
                    animation: scroll 40s linear infinite;
                    will-change: transform;
                    backface-visibility: hidden;
                    perspective: 1000px;
                    transform: translateZ(0);
                }
                
                @keyframes scroll {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
            `}</style>
        </motion.div>
    );
}
