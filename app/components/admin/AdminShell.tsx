'use client';

import { ReactNode } from 'react';
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
} from 'lucide-react';

type AdminView = 'overview' | 'events' | 'users' | 'statistics' | 'finance' | 'withdraw' | 'suggested' | 'hedging';

interface AdminShellProps {
    activeView: AdminView;
    onChangeView: (view: AdminView) => void;
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
    { id: 'withdraw', label: 'Withdrawals', icon: ShieldQuestion },
    { id: 'suggested', label: 'Suggested', icon: Lightbulb },
];

export function AdminShell({ activeView, onChangeView, onCreateEvent, children }: AdminShellProps) {
    return (
        <div className="min-h-screen bg-[#0b0b0f] text-[#e4e4e7]">
            <div className="flex">
                <aside className="fixed left-0 top-0 h-full w-64 bg-[#111113] border-r border-white/5 px-4 py-6 flex flex-col gap-6">
                    <div className="px-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">PolyBet</div>
                        <div className="text-xl font-semibold text-white mt-1">Admin</div>
                    </div>
                    <nav className="flex flex-col gap-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onChangeView(item.id)}
                                    className={cn(
                                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors border border-transparent',
                                        isActive
                                            ? 'bg-white/5 border-white/5 text-white shadow-sm'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <div className="flex-1 pl-64">
                    <header className="sticky top-0 z-20 bg-[#0b0b0f]/90 backdrop-blur border-b border-white/5">
                        <div className="px-4 md:px-8 py-4 flex flex-wrap gap-3 items-center justify-end">
                            {activeView === 'events' && onCreateEvent && (
                                <button
                                    onClick={onCreateEvent}
                                    className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-3 py-2 text-sm font-semibold hover:bg-gray-200 transition-colors"
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
