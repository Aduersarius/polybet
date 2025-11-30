'use client';

import { useEffect, useState, use } from 'react';
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Navbar } from '../../../components/Navbar';
import { ProfileHeader } from '../../../components/user/ProfileHeader';
import { UserStats } from '../../../components/user/UserStats';
import { AchievementsList } from '../../../components/user/AchievementsList';
import { ActivityList } from "../../../components/ActivityList";
import { Footer } from '../../../components/Footer';
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
});

const { useSession } = authClient;

interface UserData {
    id: string;
    address: string;
    username?: string;
    description?: string;
    avatarUrl?: string;
    achievements: string[];
    stats: {
        totalBets: number;
        totalVolume: number;
        winRate: number;
    };
}

export default function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
    const resolvedParams = use(params);
    const { data: session } = useSession();

    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchUser = async () => {
        try {
            const res = await fetch(`/api/users/${resolvedParams.address}`);
            if (!res.ok) {
                if (res.status === 404) {
                    setError('User not found');
                } else {
                    throw new Error('Failed to fetch user');
                }
                return;
            }
            const data = await res.json();
            setUser(data);
        } catch (err) {
            console.error(err);
            setError('Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUser();
    }, [resolvedParams.address]);

    // Ownership is determined by checking if the current session user ID matches the profile address
    const isOwner = Boolean((session as any)?.user?.id && (session as any).user.id.toLowerCase() === resolvedParams.address.toLowerCase());

    return (
        <div className="min-h-screen bg-black text-white">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 pt-8 pb-12">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                    </div>
                ) : error ? (
                    <div className="text-center py-20">
                        <h2 className="text-2xl font-bold text-red-400 mb-2">{error}</h2>
                        <p className="text-gray-400">The user you are looking for does not exist or could not be loaded.</p>
                    </div>
                ) : user ? (
                    <div className="animate-in fade-in duration-500">
                        <ProfileHeader
                            user={user}
                            isOwner={isOwner}
                            onUpdate={fetchUser}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 space-y-8">
                                <section>
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <span className="w-1 h-6 bg-blue-500 rounded-full" />
                                        Stats
                                    </h3>
                                    <UserStats stats={user.stats} />
                                </section>

                                <section>
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <span className="w-1 h-6 bg-purple-500 rounded-full" />
                                        Achievements
                                    </h3>
                                    <AchievementsList achievements={user.achievements} />
                                </section>
                            </div>

                            <div className="space-y-8">
                                {/* Sidebar - Recent Activity could go here */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                    <h3 className="font-bold mb-4 text-gray-200">About</h3>
                                    <div className="space-y-4 text-sm text-gray-400">
                                        <div className="flex justify-between">
                                            <span>Joined</span>
                                            <span className="text-white">
                                                {new Date().toLocaleDateString()}
                                                {/* In real app use user.createdAt */}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Rank</span>
                                            <span className="text-white">#1337</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Footer */}
                <Footer />
            </main>
        </div>
    );
}
