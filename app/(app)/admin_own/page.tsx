'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '../../components/Navbar';
import { AdminEventList } from '../../components/admin/AdminEventList';
import { AdminUserList } from '../../components/admin/AdminUserList';
import { CreateEventModal } from '../../components/admin/CreateEventModal';
import { Footer } from '../../components/Footer';
import { authClient } from '@/lib/auth-client';

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'events' | 'users'>('events');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function checkAdmin() {
            try {
                const { data: session } = await authClient.getSession();

                if (!session?.user) {
                    // Not logged in - redirect to home
                    router.push('/');
                    return;
                }

                // Check if user is admin
                const userResponse = await fetch(`/api/users/${session.user.email}`);
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData.isAdmin) {
                        setIsAdmin(true);
                    } else {
                        setIsAdmin(false);
                    }
                } else {
                    setIsAdmin(false);
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                setIsAdmin(false);
            } finally {
                setIsLoading(false);
            }
        }

        checkAdmin();
    }, [router]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
                <div className="text-gray-400">Loading...</div>
            </div>
        );
    }

    if (isAdmin === false) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white">
                <Navbar />
                <div className="flex items-center justify-center min-h-[80vh]">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
                        <p className="text-gray-400">You don't have permission to access this page.</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <Navbar />
            <div className="pt-8 px-4 max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                        Admin Dashboard
                    </h1>
                    <div className="flex space-x-2 bg-white/5 p-1 rounded-lg">
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors mr-2"
                        >
                            + Create Event
                        </button>
                        <button
                            onClick={() => setActiveTab('events')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'events'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Events
                        </button>
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'users'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Users
                        </button>
                    </div>
                </div>

                <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6">
                    {activeTab === 'events' ? <AdminEventList /> : <AdminUserList />}
                </div>
            </div>

            <CreateEventModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />

            {/* Footer */}
            <Footer />
        </div>
    );
}
