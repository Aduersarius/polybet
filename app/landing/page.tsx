'use client';
import { motion } from "framer-motion";
import { useRouter } from 'next/navigation';

export default function Landing() {
    const router = useRouter();

    return (
        <main className="min-h-screen relative">
            <motion.div
                key="landing"
                className="fixed inset-0 flex items-center justify-center z-10"
            >
                {/* Dark Background with Gradient */}
                {/* Floating Content */}
                <div className="relative z-10 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="material-card p-8 sm:p-12 !rounded-[32px] max-w-2xl mx-auto"
                    >
                        <div className="relative z-10 mb-8">
                            <h1 className="text-4xl sm:text-5xl font-black mb-4 bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent drop-shadow-2xl">
                                PolyBet
                            </h1>
                            <p className="text-lg sm:text-xl text-white/80 mb-6 font-light leading-relaxed">
                                Where markets meet destiny.
                            </p>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.8, duration: 0.5 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="mb-4 relative z-10"
                        >
                            <button
                                onClick={() => router.push('/')}
                                className="px-6 py-3 bg-gradient-to-r from-[#bb86fc] to-[#9965f4] text-white text-base font-bold rounded-full shadow-2xl shadow-[#bb86fc]/50 hover:shadow-[0_0_40px_rgba(187,134,252,0.7)] transition-all"
                            >
                                ENTER MARKETS
                            </button>
                        </motion.div>

                        <p className="text-xs text-gray-400 leading-relaxed">
                            By pressing the button user agrees to the{' '}
                            <a href="/terms" className="text-[#bb86fc] hover:text-[#9965f4] underline transition-colors">
                                Terms of Use
                            </a>
                        </p>
                    </motion.div>
                </div>

                {/* Ambient Glow Effects */}
                <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#bb86fc]/10 rounded-full blur-3xl animate-pulse" style={{ zIndex: 0 }} />
                <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#03dac6]/10 rounded-full blur-3xl animate-pulse" style={{ zIndex: 0, animationDelay: '1s' }} />
            </motion.div>
        </main>
    );
}