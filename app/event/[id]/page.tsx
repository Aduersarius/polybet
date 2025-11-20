'use client';
import { Navbar } from '@/app/components/Navbar';
import { ShareButtons } from '@/app/components/ShareButtons';
import { EventChat } from '@/app/components/EventChat';
import { OddsGraph } from '@/app/components/OddsGraph';
import { VolumeGraph } from '@/app/components/VolumeGraph';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { MOCK_EVENTS } from '@/app/data/mockEvents';
import Link from 'next/link';

export default function EventPage() {
    const params = useParams();
    const eventId = parseInt(params.id as string);

    // Find the actual event from mock data
    const event = MOCK_EVENTS.find(e => e.id === eventId) || MOCK_EVENTS[0];

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
            {/* Animated Background */}
            <div className="fixed inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-[#bb86fc]/5 via-transparent to-[#03dac6]/5" />
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 90, 0],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="absolute top-1/4 -left-1/4 w-96 h-96 bg-[#bb86fc]/10 rounded-full blur-3xl"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        rotate: [0, -90, 0],
                    }}
                    transition={{
                        duration: 25,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-[#03dac6]/10 rounded-full blur-3xl"
                />
            </div>

            <div className="relative z-10">
                <Navbar />

                <div className="pt-24 px-4 max-w-7xl mx-auto pb-8">
                    {/* Back Button */}
                    <Link href="/#markets" scroll={false}>
                        <motion.button
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={{ x: -5 }}
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
                        >
                            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to Markets
                        </motion.button>
                    </Link>

                    {/* Header Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <motion.span
                                whileHover={{ scale: 1.05 }}
                                className="px-5 py-2 bg-gradient-to-r from-[#bb86fc] via-[#a66ef1] to-[#9965f4] rounded-full text-sm font-bold shadow-2xl shadow-[#bb86fc]/30 backdrop-blur-sm"
                            >
                                {event.category}
                            </motion.span>
                            <div className="flex items-center gap-2 text-sm text-gray-300 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                                <svg className="w-4 h-4 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Ends {event.endsAt.toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                                <svg className="w-4 h-4 text-[#bb86fc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                {event.totalBets.toLocaleString()} bets
                            </div>
                        </div>

                        <h1 className="text-5xl font-bold mb-5 bg-gradient-to-r from-white via-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent leading-tight drop-shadow-lg">
                            {event.title}
                        </h1>
                        <p className="text-gray-300 text-lg mb-6 max-w-3xl leading-relaxed">{event.description}</p>

                        <ShareButtons eventTitle={event.title} eventId={event.id.toString()} />
                    </motion.div>

                    {/* Stats Cards - Glassmorphism */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8"
                    >
                        <motion.div
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-white/5 backdrop-blur-xl p-5 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-[#bb86fc]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm text-gray-400 font-medium">Total Volume</div>
                                    <div className="w-8 h-8 rounded-full bg-[#bb86fc]/20 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-[#bb86fc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="text-3xl font-bold bg-gradient-to-r from-[#bb86fc] to-[#9965f4] bg-clip-text text-transparent">${(event.volume / 1000000).toFixed(1)}M</div>
                            </div>
                        </motion.div>

                        <motion.div
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-white/5 backdrop-blur-xl p-5 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-[#03dac6]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm text-gray-400 font-medium">Current Odds</div>
                                    <div className="w-8 h-8 rounded-full bg-[#03dac6]/20 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl font-bold text-[#03dac6]">{event.yesOdds}%</span>
                                    <span className="text-gray-500 text-xl">/</span>
                                    <span className="text-2xl font-bold text-[#cf6679]">{event.noOdds}%</span>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-white/5 backdrop-blur-xl p-5 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-[#03dac6]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm text-gray-400 font-medium">Time Remaining</div>
                                    <div className="w-8 h-8 rounded-full bg-[#03dac6]/20 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="text-3xl font-bold bg-gradient-to-r from-[#03dac6] to-[#02b3a5] bg-clip-text text-transparent">
                                    {(() => {
                                        const timeRemaining = event.endsAt.getTime() - Date.now();
                                        if (timeRemaining <= 0) return 'Ended';
                                        return Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)) + 'd';
                                    })()}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Betting Section - Premium Design */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-8"
                    >
                        <h2 className="text-2xl font-bold mb-5 flex items-center gap-3">
                            <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Place Your Bet</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
                        </h2>

                        {/* Balance Bar */}
                        <div className="mb-5">
                            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                                <span>Yes: {event.yesOdds}%</span>
                                <span>No: {event.noOdds}%</span>
                            </div>
                            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-[#03dac6] to-[#02b3a5] transition-all duration-300"
                                    style={{ width: `${event.yesOdds}%` }}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <motion.button
                                whileHover={{ scale: 1.03, y: -5 }}
                                whileTap={{ scale: 0.97 }}
                                className="group relative bg-gradient-to-br from-[#03dac6]/20 via-[#03dac6]/10 to-transparent backdrop-blur-xl border-2 border-[#03dac6]/50 rounded-3xl p-8 transition-all shadow-2xl hover:shadow-[#03dac6]/30 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-[#03dac6]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <motion.div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-20"
                                    animate={{
                                        background: [
                                            'radial-gradient(circle at 0% 0%, #03dac6 0%, transparent 50%)',
                                            'radial-gradient(circle at 100% 100%, #03dac6 0%, transparent 50%)',
                                            'radial-gradient(circle at 0% 0%, #03dac6 0%, transparent 50%)',
                                        ],
                                    }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                />

                                <div className="relative z-10">
                                    <div className="absolute top-0 right-0 w-12 h-12 rounded-full bg-[#03dac6]/30 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-6 h-6 text-[#03dac6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>

                                    <div className="text-xs text-[#03dac6] font-bold tracking-widest mb-3 uppercase">Bet Yes</div>
                                    <div className="text-5xl font-black mb-3 bg-gradient-to-r from-white to-[#03dac6] bg-clip-text text-transparent">{(100 / event.yesOdds).toFixed(2)}x</div>
                                    <div className="text-sm text-gray-300 font-medium mb-5">$0.{100 - event.yesOdds} per share</div>

                                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#03dac6] to-[#02b3a5] hover:from-[#02b3a5] hover:to-[#03dac6] rounded-full font-bold text-black shadow-lg shadow-[#03dac6]/50 group-hover:shadow-2xl group-hover:shadow-[#03dac6]/60 transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                        Bet Yes
                                    </div>
                                </div>
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.03, y: -5 }}
                                whileTap={{ scale: 0.97 }}
                                className="group relative bg-gradient-to-br from-[#cf6679]/20 via-[#cf6679]/10 to-transparent backdrop-blur-xl border-2 border-[#cf6679]/50 rounded-3xl p-8 transition-all shadow-2xl hover:shadow-[#cf6679]/30 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-[#cf6679]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <motion.div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-20"
                                    animate={{
                                        background: [
                                            'radial-gradient(circle at 100% 0%, #cf6679 0%, transparent 50%)',
                                            'radial-gradient(circle at 0% 100%, #cf6679 0%, transparent 50%)',
                                            'radial-gradient(circle at 100% 0%, #cf6679 0%, transparent 50%)',
                                        ],
                                    }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                />

                                <div className="relative z-10">
                                    <div className="absolute top-0 right-0 w-12 h-12 rounded-full bg-[#cf6679]/30 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-6 h-6 text-[#cf6679]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>

                                    <div className="text-xs text-[#cf6679] font-bold tracking-widest mb-3 uppercase">Bet No</div>
                                    <div className="text-5xl font-black mb-3 bg-gradient-to-r from-white to-[#cf6679] bg-clip-text text-transparent">{(100 / event.noOdds).toFixed(2)}x</div>
                                    <div className="text-sm text-gray-300 font-medium mb-5">$0.{100 - event.noOdds} per share</div>

                                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#cf6679] to-[#b85868] hover:from-[#b85868] hover:to-[#cf6679] rounded-full font-bold text-white shadow-lg shadow-[#cf6679]/50 group-hover:shadow-2xl group-hover:shadow-[#cf6679]/60 transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                        </svg>
                                        Bet No
                                    </div>
                                </div>
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* Main Content - Graphs */}
                    <div className="space-y-5 mb-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <OddsGraph eventId={eventId.toString()} />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            <VolumeGraph eventId={eventId.toString()} />
                        </motion.div>
                    </div>

                    {/* Live Chat */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="w-full"
                    >
                        <EventChat eventId={eventId.toString()} />
                    </motion.div>
                </div>
            </div>
        </main>
    );
}
