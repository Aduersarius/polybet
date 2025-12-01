'use client';

import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { motion } from 'framer-motion';
import { Session, User } from '@/lib/session-types';

export default function ProfilePage() {
    const { data: session, isPending } = useSession() as { data: Session | null, isPending: boolean };
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        image: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [stats, setStats] = useState({
        totalBets: 0,
        totalVolume: 0,
        winRate: 0
    });

    useEffect(() => {
        if (!isPending && !session) {
            router.push('/');
        } else if (session?.user) {
            setFormData({
                name: session.user.name || '',
                image: session.user.image || '',
            });
        }
    }, [session, isPending, router]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) throw new Error('Failed to update profile');

            // Refresh session/page to show new data
            window.location.reload();
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to save changes');
        } finally {
            setIsSaving(false);
            setIsEditing(false);
        }
    };

    if (isPending || !session) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
                <div className="animate-pulse text-blue-400">Loading profile...</div>
            </div>
        );
    }

    const user = session?.user;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 py-12">
                {/* Profile Header */}
                <div className="bg-[#1e1e1e] rounded-2xl p-8 border border-white/10 mb-8">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        {/* Avatar */}
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white overflow-hidden border-4 border-[#0a0a0a] shadow-xl">
                                {formData.image ? (
                                    <img src={formData.image} alt={formData.name} className="w-full h-full object-cover" />
                                ) : (
                                    (user?.name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase()
                                )}
                            </div>
                            {isEditing && (
                                <div className="absolute -bottom-2 w-full">
                                    <input
                                        type="text"
                                        placeholder="Image URL"
                                        className="w-full text-xs bg-black/80 border border-white/20 rounded px-2 py-1 text-white"
                                        value={formData.image}
                                        onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                    />
                                </div>
                            )}
                            <button className="absolute bottom-0 right-0 bg-blue-500 p-2 rounded-full text-white shadow-lg hover:bg-blue-600 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                        </div>

                        {/* User Info */}
                        <div className="flex-1 text-center md:text-left w-full">
                            {isEditing ? (
                                <div className="max-w-md">
                                    <label className="block text-xs text-gray-500 uppercase mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white text-xl font-bold mb-2 focus:outline-none focus:border-blue-500"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                            ) : (
                                <h1 className="text-3xl font-bold text-white mb-2">{user?.name || 'User'}</h1>
                            )}

                            <p className="text-gray-400 mb-4">{user?.email || 'No email'}</p>

                            <div className="flex flex-wrap justify-center md:justify-start gap-3">
                                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm border border-blue-500/20">
                                    Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}
                                </span>
                                {user?.isAdmin && (
                                    <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-sm border border-purple-500/20">
                                        Administrator
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-3 gap-6 text-center">
                            <div>
                                <div className="text-2xl font-bold text-white">$1,250</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Balance</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-green-400">12</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Active Bets</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-blue-400">68%</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Win Rate</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Tabs */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Activity & Stats */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden">
                            <div className="p-6 border-b border-white/10 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                                <button className="text-sm text-blue-400 hover:text-blue-300">View All</button>
                            </div>
                            <div className="p-6 text-center text-gray-500 py-12">
                                No recent activity found. Start betting to see your history!
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Account Settings Preview */}
                    <div className="space-y-6">
                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6">
                            <h2 className="text-lg font-bold text-white mb-4">Account Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">Username</label>
                                    <div className="text-white">{user?.name || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
                                    <div className="text-white">{user?.email || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">User ID</label>
                                    <div className="text-gray-400 text-sm font-mono truncate">{user?.id || 'N/A'}</div>
                                </div>
                            </div>

                            {isEditing ? (
                                <div className="flex gap-2 mt-6">
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="flex-1 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="w-full mt-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
                                >
                                    Edit Profile
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
