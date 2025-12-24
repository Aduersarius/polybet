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
import type { Session } from '@/lib/session-types';

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
    const [isMounted, setIsMounted] = useState(false);

    // Enable WebSocket real-time updates
    useAdminWebSocket();

    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, isPending } = useSession() as { data: Session | null; isPending: boolean };

    // Ensure client-side only rendering to prevent hydration mismatch
    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        const viewParam = (searchParams.get('view') as AdminView | null) || null;
        const allowed: AdminView[] = ['overview', 'events', 'users', 'statistics', 'finance', 'withdraw', 'suggested', 'hedging', 'polymarket-intake'];
        if (viewParam && allowed.includes(viewParam)) {
            setActiveView(viewParam);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Check authentication and admin status
    useEffect(() => {
        if (!isPending && isMounted) {
            if (!session?.user) {
                // Not authenticated - redirect to home
                router.push('/');
            } else if (!session.user.isAdmin) {
                // Not admin - redirect to home
                router.push('/');
            }
        }
    }, [session, isPending, isMounted, router]);

    // Show loading state while checking session or before mount (prevents hydration mismatch)
    if (!isMounted || isPending) {
        return (
            <div className="min-h-screen bg-background text-zinc-200 flex items-center justify-center">
                <div className="text-muted-foreground">Loading...</div>
            </div>
        );
    }

    // If not authenticated or not admin, show nothing (redirect is in progress)
    if (!session?.user || !session.user.isAdmin) {
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
                <div className="min-h-screen bg-background text-zinc-200 flex items-center justify-center">
                    <div className="text-muted-foreground">Loading admin...</div>
                </div>
            }
        >
            <AdminPageContent />
        </Suspense>
    );
}
