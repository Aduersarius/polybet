'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminEventList } from '../../components/admin/AdminEventList';
import { AdminUserList } from '../../components/admin/AdminUserList';
import { AdminOverview } from '../../components/admin/AdminOverview';
import { AdminProductAnalytics } from '../../components/admin/AdminProductAnalytics';
import { AdminFinance } from '../../components/admin/AdminFinance';
import { AdminWithdraw } from '../../components/admin/AdminWithdraw';
import { AdminSuggestedEvents } from '../../components/admin/AdminSuggestedEvents';
import { AdminHedging } from '../../components/admin/AdminHedging';
import { AdminPolymarketIntake } from '../../components/admin/AdminPolymarketIntake';
import { CreateEventModal } from '../../components/admin/CreateEventModal';
import { useSession } from '@/lib/auth-client';
import { useAdminWebSocket } from '@/hooks/useAdminWebSocket';
import { AdminShell } from '../../components/admin/AdminShell';

type AdminView = 'overview' | 'events' | 'users' | 'statistics' | 'finance' | 'withdraw' | 'suggested' | 'hedging' | 'polymarket-intake';

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
    const [activeView, setActiveView] = useState<AdminView>('overview');
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
        const allowed: AdminView[] = ['overview', 'events', 'users', 'statistics', 'finance', 'withdraw', 'suggested', 'hedging', 'polymarket-intake'];
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
                <section className="relative z-10 space-y-6">
                    {activeView === 'overview' && <AdminOverview />}
                    {activeView === 'events' && <AdminEventList onEditEvent={(event) => { setSelectedEvent(event as AdminEvent); setIsCreateModalOpen(true); }} />}
                    {activeView === 'users' && <AdminUserList />}
                    {activeView === 'statistics' && <AdminProductAnalytics />}
                    {activeView === 'finance' && <AdminFinance />}
                    {activeView === 'withdraw' && <AdminWithdraw />}
                    {activeView === 'suggested' && <AdminSuggestedEvents />}
                    {activeView === 'hedging' && <AdminHedging />}
                    {activeView === 'polymarket-intake' && <AdminPolymarketIntake />}
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
