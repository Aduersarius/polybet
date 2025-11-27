'use client';

import { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { AdminEventList } from '../components/admin/AdminEventList';
import { AdminUserList } from '../components/admin/AdminUserList';
import { CreateEventModal } from '../components/admin/CreateEventModal';
import { Footer } from '../components/Footer';

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'events' | 'users'>('events');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Mock admin check (in production, verify via API)
    const isAdmin = true; // For development

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
