'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import Link from 'next/link';
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
    ChevronLeft,
    ChevronRight,
    UserCheck,
    Home,
    LogOut,
    Settings,
    User,
} from 'lucide-react';

type AdminView = 'overview' | 'events' | 'users' | 'statistics' | 'finance' | 'withdraw' | 'suggested' | 'hedging' | 'polymarket-intake' | 'support' | 'affiliates';

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
    { id: 'affiliates', label: 'Affiliates', icon: UserCheck },
    { id: 'suggested', label: 'Suggested', icon: Lightbulb },
    { id: 'support', label: 'Support', icon: Headphones },
];

export function AdminShell({ activeView, onChangeView, onCreateEvent, children }: AdminShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session } = useSession();
    const user = (session as any)?.user;

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

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

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-[var(--background)] text-white">
            <div className="flex">
                <aside
                    className={cn(
                        'fixed left-0 top-0 h-full bg-[var(--surface)] border-r border-white/10 px-3 py-4 flex flex-col z-30',
                        sidebarOpen ? 'w-64' : 'w-16'
                    )}
                    style={{ transition: 'width 150ms ease-out' }}
                >
                    {/* Header */}
                    <div className={cn(
                        'flex items-center mb-6',
                        sidebarOpen ? 'justify-between px-2' : 'justify-center'
                    )}>
                        {sidebarOpen && (
                            <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Pariflow</div>
                                <div className="text-lg font-semibold text-white mt-0.5">Admin Panel</div>
                            </div>
                        )}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className={cn(
                                'p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/60 hover:text-white border border-white/10',
                                !sidebarOpen && 'w-10 h-10 flex items-center justify-center'
                            )}
                            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                        >
                            {sidebarOpen ? (
                                <ChevronLeft className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>
                    </div>

                    {/* Back to App Button */}
                    <Link
                        href="/"
                        className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors mb-4',
                            'bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20',
                            !sidebarOpen && 'justify-center px-2'
                        )}
                        title={!sidebarOpen ? 'Back to App' : undefined}
                    >
                        <Home className="h-4 w-4 flex-shrink-0" />
                        {sidebarOpen && <span>Back to App</span>}
                    </Link>

                    {/* Divider */}
                    <div className="border-t border-white/10 mb-3" />

                    {/* Navigation */}
                    <nav className="flex flex-col gap-1 flex-1 overflow-y-auto no-scrollbar">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeView === item.id;
                            if (onChangeView) {
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onChangeView(item.id)}
                                        className={cn(
                                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                                            isActive
                                                ? 'bg-white/10 text-white'
                                                : 'text-white/60 hover:bg-white/5 hover:text-white',
                                            !sidebarOpen && 'justify-center px-2'
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

                    {/* User Section at Bottom */}
                    <div className="mt-auto pt-4 border-t border-white/10">
                        <div className="relative">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className={cn(
                                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-white/5',
                                    !sidebarOpen && 'justify-center px-2'
                                )}
                            >
                                {/* Avatar */}
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center text-white font-medium text-sm overflow-hidden flex-shrink-0">
                                    {user?.image ? (
                                        <img src={user.image} alt={user.name || 'User'} className="w-full h-full object-cover" />
                                    ) : (
                                        (user?.name?.charAt(0) || user?.email?.charAt(0) || 'A').toUpperCase()
                                    )}
                                </div>
                                {sidebarOpen && (
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="text-sm font-medium text-white truncate">
                                            {user?.name || 'Admin'}
                                        </div>
                                        <div className="text-xs text-white/50 truncate">
                                            {user?.email || 'admin@pariflow.com'}
                                        </div>
                                    </div>
                                )}
                            </button>

                            {/* User Dropdown Menu */}
                            {showUserMenu && (
                                <>
                                    {/* Backdrop */}
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setShowUserMenu(false)}
                                    />

                                    {/* Menu */}
                                    <div className={cn(
                                        'absolute z-50 bg-[var(--surface-elevated)] border border-white/10 rounded-xl shadow-2xl py-2 min-w-[200px]',
                                        sidebarOpen ? 'bottom-full left-0 mb-2' : 'left-full bottom-0 ml-2'
                                    )}>
                                        <div className="px-4 py-2 border-b border-white/10 mb-2">
                                            <div className="text-sm font-medium text-white truncate">
                                                {user?.name || 'Admin User'}
                                            </div>
                                            <div className="text-xs text-white/50 truncate">
                                                {user?.email}
                                            </div>
                                        </div>

                                        <Link
                                            href="/profile"
                                            onClick={() => setShowUserMenu(false)}
                                            className="flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            <User className="h-4 w-4" />
                                            Profile
                                        </Link>
                                        <Link
                                            href="/settings"
                                            onClick={() => setShowUserMenu(false)}
                                            className="flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            <Settings className="h-4 w-4" />
                                            Settings
                                        </Link>

                                        <div className="border-t border-white/10 mt-2 pt-2">
                                            <button
                                                onClick={handleSignOut}
                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                            >
                                                <LogOut className="h-4 w-4" />
                                                Sign Out
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </aside>

                <div
                    className={cn(
                        'flex-1',
                        sidebarOpen ? 'pl-64' : 'pl-16'
                    )}
                    style={{
                        transition: 'padding-left 150ms ease-out',
                        '--sidebar-width': sidebarOpen ? '256px' : '64px'
                    } as any}
                >
                    <header className="sticky top-0 z-20 bg-[var(--background)]/90 backdrop-blur-xl border-b border-white/10">
                        <div className="px-4 md:px-8 py-4 flex flex-wrap gap-3 items-center justify-end">
                            {activeView === 'events' && onCreateEvent && (
                                <button
                                    onClick={onCreateEvent}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] text-white px-4 py-2.5 text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors shadow-lg shadow-[var(--primary)]/20"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create Event
                                </button>
                            )}
                        </div>
                    </header>

                    <main className="px-4 md:px-8 py-6">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
