'use client';

import { AdminEventList } from '../../components/admin/AdminEventList';
import { AdminUserList } from '../../components/admin/AdminUserList';
import { AdminStatistics } from '../../components/admin/AdminStatistics';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';

export default function AdminTestPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <Navbar isAdminPage={true} />

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6">
                    <h1 className="text-2xl font-bold mb-6">Admin Test Page - Solid Tables</h1>

                    <h2 className="text-xl mb-4">Event List (Solid Dark Gray)</h2>
                    <div className="mb-8">
                        <AdminEventList onEditEvent={(event) => console.log('Edit event:', event)} />
                    </div>

                    <h2 className="text-xl mb-4">User List (Solid Dark Gray)</h2>
                    <div className="mb-8">
                        <AdminUserList />
                    </div>

                    <h2 className="text-xl mb-4">Statistics (Solid Dark Gray)</h2>
                    <div>
                        <AdminStatistics />
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}