'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Users,
    LineChart,
    Wallet,
    ShieldQuestion,
    Lightbulb,
    Search,
    Plus,
    Shield,
    Headphones,
    Menu,
    ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';

type AdminView = 'overview' | 'events' | 'users' | 'statistics' | 'finance' | 'withdraw' | 'suggested' | 'hedging' | 'polymarket-intake' | 'support';

interface AdminShellProps {
    activeView?: AdminView;
    onChangeView?: (view: AdminView) => void;
    onCreateEvent?: () => void;
    children: ReactNode;
}

const navItems: { id: AdminView; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'events', label: 'Events', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'statistics', label: 'Analytics', icon: LineChart },
    { id: 'finance', label: 'Finance', icon: Wallet },
    { id: 'hedging', label: 'Hedging', icon: Shield },
    { id: 'polymarket-intake', label: 'Polymarket Intake', icon: Search },
    { id: 'withdraw', label: 'Withdrawals', icon: ShieldQuestion },
    { id: 'suggested', label: 'Suggested', icon: Lightbulb },
    { id: 'support', label: 'Support', icon: Headphones },
];

export function AdminShell({ activeView, onChangeView, onCreateEvent, children }: AdminShellProps) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Load sidebar state from localStorage on mount
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('admin-sidebar-open');
        if (saved !== null) {
            setSidebarOpen(saved === 'true');
        }
    }, []);

    // Save sidebar state to localStorage when it changes
    useEffect(() => {
        if (mounted) {
            localStorage.setItem('admin-sidebar-open', String(sidebarOpen));
        }
    }, [sidebarOpen, mounted]);

    return (
        <div className="min-h-screen bg-background text-zinc-200">
            <div className="flex">
                <aside
                    className={cn(
                        'fixed left-0 top-0 h-full bg-surface border-r border-white/5 px-4 py-6 flex flex-col gap-6 transition-all duration-300 z-30',
                        sidebarOpen ? 'w-64' : 'w-16'
                    )}
                >
                    <div className="px-2 flex items-center justify-between">
                        {sidebarOpen && (
                            <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">PolyBet</div>
                                <div className="text-xl font-semibold text-zinc-200 mt-1">Admin</div>
                            </div>
                        )}
                        {!sidebarOpen && (
                            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">PB</div>
                        )}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-zinc-200"
                            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                        >
                            {sidebarOpen ? (
                                <ChevronLeft className="h-4 w-4" />
                            ) : (
                                <Menu className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                    <nav className="flex flex-col gap-1 flex-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeView === item.id;
                            if (onChangeView) {
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onChangeView(item.id)}
                                        className={cn(
                                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors border border-transparent',
                                            isActive
                                                ? 'bg-white/5 border-white/5 text-zinc-200 shadow-sm'
                                                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                                            !sidebarOpen && 'justify-center'
                                        )}
                                        title={!sidebarOpen ? item.label : undefined}
                                    >
                                        <Icon className="h-4 w-4 flex-shrink-0" />
                                        {sidebarOpen && <span>{item.label}</span>}
                                    </button>
                                );
                            }
                            return null;
                        })}
                    </nav>
                </aside>

                <div
                    className={cn(
                        'flex-1 transition-all duration-300',
                        sidebarOpen ? 'pl-64' : 'pl-16'
                    )}
                >
                    <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-white/5">
                        <div className="px-4 md:px-8 py-4 flex flex-wrap gap-3 items-center justify-end">
                            {activeView === 'events' && onCreateEvent && (
                                <button
                                    onClick={onCreateEvent}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create event
                                </button>
                            )}
                        </div>
                    </header>

                    <main className="px-4 md:px-8 py-4">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
