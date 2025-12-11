'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '../../components/Navbar';
import { AdminEventList } from '../../components/admin/AdminEventList';
import { AdminUserList } from '../../components/admin/AdminUserList';
import { AdminStatistics } from '../../components/admin/AdminStatistics';
import { AdminFinance } from '../../components/admin/AdminFinance';
import { AdminWithdraw } from '../../components/admin/AdminWithdraw';
import { CreateEventModal } from '../../components/admin/CreateEventModal';
import { Footer } from '../../components/Footer';
import { useSession } from '@/lib/auth-client';
import { useAdminWebSocket } from '@/hooks/useAdminWebSocket';

type AdminView = 'events' | 'users' | 'statistics' | 'finance' | 'withdraw';

interface AdminEvent {
    id: string;
    title: string;
    description: string;
    categories: string[];
    resolutionDate: string;
    imageUrl: string | null;
    type: string;
    isHidden: boolean;
}

export default function AdminPage() {
    const [activeView, setActiveView] = useState<AdminView>('events');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null);

    // Enable WebSocket real-time updates
    useAdminWebSocket();

    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, isPending } = useSession();

    useEffect(() => {
        // Temporarily bypass authentication to show the tables
        setIsAdmin(true);
    }, []);

    useEffect(() => {
        const viewParam = (searchParams.get('view') as AdminView | null) || null;
        const allowed: AdminView[] = ['events', 'users', 'statistics', 'finance', 'withdraw'];
        if (viewParam && allowed.includes(viewParam)) {
            setActiveView(viewParam);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Temporarily bypass session loading for testing
    // if (isPending || isAdmin === null) {
    //     return (
    //         <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
    //             <div className="text-gray-400">Loading...</div>
    //         </div>
    //     );
    // }

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

    const menuItems = [
        { id: 'events', label: 'Events', icon: '📊' },
        { id: 'users', label: 'Users', icon: '👥' },
        { id: 'statistics', label: 'Statistics', icon: '📈' },
        { id: 'finance', label: 'Money', icon: '💵' },
        { id: 'withdraw', label: 'Withdrawals', icon: '🏧' },
    ];

    return (
        <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-white">
            <Navbar
                isAdminPage={true}
                activeAdminView={activeView}
                onAdminViewChange={(view) => {
                    const nextView = view as AdminView;
                    setActiveView(nextView);
                    router.replace(`/admin?view=${nextView}`);
                }}
                onCreateEvent={() => {
                    setSelectedEvent(null);
                    setIsCreateModalOpen(true);
                }}
            />

            {/* Main Content */}
            <div className="flex-1">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 relative z-10">
                        {activeView === 'events' && <AdminEventList onEditEvent={(event) => { setSelectedEvent(event as AdminEvent); setIsCreateModalOpen(true); }} />}
                        {activeView === 'users' && <AdminUserList />}
                        {activeView === 'statistics' && <AdminStatistics />}
                        {activeView === 'finance' && <AdminFinance />}
                        {activeView === 'withdraw' && <AdminWithdraw />}
                    </div>
                </div>
            </div>

            {/* Create/Edit Event Modal */}
            <CreateEventModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setSelectedEvent(null);
                }}
                event={selectedEvent}
            />

            <Footer />
        </div>
    );
}
