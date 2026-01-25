'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Navbar } from '@/app/components/Navbar';
import { Footer } from '@/app/components/Footer';
import { motion } from 'framer-motion';

export default function ReferralsPage() {
    const { data: session } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (!session?.user) {
            router.push('/');
        }
    }, [session, router]);

    // For now, redirect to main page as per user's request
    useEffect(() => {
        if (session?.user) {
            router.push('/');
        }
    }, [session, router]);

    return (
        <main className="flex flex-col relative overflow-x-hidden max-w-full min-h-screen">
            <Navbar />
            <div className="flex-grow overflow-x-hidden max-w-full">
                <div className="min-h-screen relative text-white z-10 overflow-x-hidden max-w-full pt-32">
                    <div className="max-w-7xl mx-auto px-6 pb-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center py-20"
                        >
                            <h1 className="text-3xl font-bold mb-4">Referral Program</h1>
                            <p className="text-gray-400">Coming soon...</p>
                        </motion.div>
                    </div>
                </div>
            </div>
            <Footer />
        </main>
    );
}
