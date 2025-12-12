'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminEventList } from '../../components/admin/AdminEventList';
import { AdminUserList } from '../../components/admin/AdminUserList';
import { AdminStatistics } from '../../components/admin/AdminStatistics';
import { AdminFinance } from '../../components/admin/AdminFinance';
import { AdminWithdraw } from '../../components/admin/AdminWithdraw';
import { AdminSuggestedEvents } from '../../components/admin/AdminSuggestedEvents';
import { CreateEventModal } from '../../components/admin/CreateEventModal';
import { useSession } from '@/lib/auth-client';
import { useAdminWebSocket } from '@/hooks/useAdminWebSocket';
import { AdminShell } from '../../components/admin/AdminShell';

type AdminView = 'events' | 'users' | 'statistics' | 'finance' | 'withdraw' | 'suggested';

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

function AdminPageContent() {
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
        const allowed: AdminView[] = ['events', 'users', 'statistics', 'finance', 'withdraw', 'suggested'];
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
        return null;
    }

    return (
        <AdminShell
            activeView={activeView}
            onChangeView={(view) => {
                setActiveView(view);
                router.replace(`/admin?view=${view}`);
            }}
            onCreateEvent={() => {
                setSelectedEvent(null);
                setIsCreateModalOpen(true);
            }}
        >
            <div className="space-y-6">
                <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Admin dashboard</p>
                    <h1 className="text-3xl font-bold text-white">Overview</h1>
                    <p className="text-sm text-gray-400">Monitor events, users, liquidity, and suggestions.</p>
                </div>

                <section className="relative z-10 space-y-6">
                    {activeView === 'events' && <AdminEventList onEditEvent={(event) => { setSelectedEvent(event as AdminEvent); setIsCreateModalOpen(true); }} />}
                    {activeView === 'users' && <AdminUserList />}
                    {activeView === 'statistics' && <AdminStatistics />}
                    {activeView === 'finance' && <AdminFinance />}
                    {activeView === 'withdraw' && <AdminWithdraw />}
                    {activeView === 'suggested' && <AdminSuggestedEvents />}
                </section>
            </div>

            <CreateEventModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setSelectedEvent(null);
                }}
                event={selectedEvent}
            />
        </AdminShell>
    );
}

export default function AdminPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
                    <div className="text-gray-400">Loading admin...</div>
                </div>
            }
        >
            <AdminPageContent />
        </Suspense>
    );
}
