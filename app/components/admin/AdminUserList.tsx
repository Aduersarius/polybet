'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from './Pagination';

interface AdminUser {
    id: string;
    address: string;
    username: string | null;
    email: string | null;
    name: string | null;
    isBanned: boolean;
    isAdmin: boolean;
    isDeleted: boolean;
    lastIp?: string | null;
    lastCountry?: string | null;
    lastUserAgent?: string | null;
    lastDevice?: string | null;
    lastOs?: string | null;
    lastVisitedAt?: string | null;
    currentBalance?: number;
    totalDeposited?: number;
    totalWithdrawn?: number;
    _count: {
        marketActivity: number;
        createdEvents: number;
    };
    createdAt: string;
}

export function AdminUserList() {
    const adminId = 'dev-user'; // Mock admin ID
    const queryClient = useQueryClient();
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const itemsPerPage = 10;

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    const { data: usersData, isLoading } = useQuery({
        queryKey: ['admin', 'users', adminId, currentPage, debouncedSearch, sortField, sortDir],
        queryFn: async () => {
            const params = new URLSearchParams({
                adminId,
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(debouncedSearch && { search: debouncedSearch }),
                sortField,
                sortDir,
            });
            const res = await fetch(`/api/admin/users?${params}`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json() as Promise<{ users: AdminUser[]; total: number }>;
        },
    });

    const users = usersData?.users || [];
    const totalUsers = usersData?.total || 0;
    const totalPages = Math.ceil(totalUsers / itemsPerPage);

    // Derived counts for header
    const activeCount = users.filter((u) => !u.isBanned && !u.isDeleted).length;
    const adminCount = users.filter((u) => u.isAdmin).length;
    const bannedCount = users.filter((u) => u.isBanned && !u.isDeleted).length;
    const deletedCount = users.filter((u) => u.isDeleted).length;


    const updateUserMutation = useMutation({
        mutationFn: async ({ targetUserId, action }: { targetUserId: string; action: string }) => {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, targetUserId, action }),
            });
            if (!res.ok) throw new Error('Failed to update user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            setSelectedUser(null);
        },
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (targetUserId: string) => {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, targetUserId }),
            });
            if (!res.ok) throw new Error('Failed to delete user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            setSelectedUser(null);
        },
    });

    const handleDeleteUser = (user: AdminUser) => {
        if (confirm(`Are you sure you want to delete user "${user.username || user.email || user.address}"?\n\nThis will soft-delete the user (mark as deleted). Their data will be preserved but they will be unable to log in.`)) {
            deleteUserMutation.mutate(user.id);
        }
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        setSelectedUser(null); // Clear selected user when changing pages
    };

    if (isLoading) {
        return (
            <Card className="border-0 bg-surface">
                <CardHeader>
                    <CardTitle className="text-zinc-200">Users</CardTitle>
                    <CardDescription>Loading users…</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4 relative z-10">
            <Card className="border-0 bg-surface overflow-hidden max-w-full">
                <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-zinc-200">Users</CardTitle>
                            <CardDescription>Manage members, roles, and status</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                            <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-200">
                                Total {totalUsers}
                            </Badge>
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100">
                                Active {activeCount}
                            </Badge>
                            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-100">
                                Admins {adminCount}
                            </Badge>
                            <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-100">
                                Banned {bannedCount}
                            </Badge>
                            {deletedCount > 0 && (
                                <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-100">
                                    Deleted {deletedCount}
                                </Badge>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by name, username, email, or address..."
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-2 pl-10 text-zinc-200 placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                            />
                            <svg
                                className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        {searchQuery && (
                            <div className="text-sm text-muted-foreground">
                                Found {totalUsers} users
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-zinc-300">
                            <span className="text-xs uppercase tracking-wide text-zinc-500">Sort</span>
                            <select
                                value={sortField}
                                onChange={(e) => setSortField(e.target.value)}
                                className="rounded-md bg-white/5 border border-white/5 px-2 py-1 text-xs text-zinc-200"
                            >
                                <option value="createdAt">Joined</option>
                                <option value="username">Username</option>
                                <option value="email">Email</option>
                                <option value="lastVisitedAt">Last seen</option>
                                <option value="totalDeposited">Deposited</option>
                                <option value="totalWithdrawn">Withdrawn</option>
                            </select>
                            <select
                                value={sortDir}
                                onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                                className="rounded-md bg-white/5 border border-white/5 px-2 py-1 text-xs text-zinc-200"
                            >
                                <option value="desc">Desc</option>
                                <option value="asc">Asc</option>
                            </select>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="w-full px-4 pb-4 space-y-3">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className={`rounded-lg border transition-colors p-3 md:p-4 ${user.isDeleted
                                        ? 'border-zinc-500/20 bg-zinc-500/[0.02] hover:bg-zinc-500/[0.04] opacity-60'
                                        : 'border-white/5 bg-white/[0.04] hover:bg-white/[0.06]'
                                    }`}
                                onClick={() => setSelectedUser(user === selectedUser ? null : user)}
                            >
                                <div className="grid gap-3 md:grid-cols-12 md:items-center">
                                    <div className="md:col-span-3 space-y-1">
                                        <div className="text-sm text-muted-foreground">User</div>
                                        <div className="font-semibold text-zinc-200">
                                            {user.name || user.username || (user.address ? `${user.address.slice(0, 12)}...` : '—')}
                                        </div>
                                        <div className="text-xs text-zinc-500 font-mono">
                                            {user.address ? `${user.address.slice(0, 10)}…` : '—'}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">{user.email || '—'}</div>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <div className="text-xs text-muted-foreground">Activity</div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-100">
                                                Bets {user._count.marketActivity}
                                            </Badge>
                                            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-100">
                                                Events {user._count.createdEvents}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                                            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5">
                                                Vol: ${(user as any).betVolume?.toFixed ? (user as any).betVolume.toFixed(0) : '0'}
                                            </span>
                                            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5">
                                                Win rate: {(user as any).winRate != null ? `${(user as any).winRate}%` : '—'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <div className="text-xs text-muted-foreground">Balance</div>
                                        <div className="text-sm text-zinc-200">
                                            {typeof user.currentBalance === 'number' ? `$${user.currentBalance.toFixed(2)}` : '—'}
                                        </div>
                                        <div className="text-xs text-zinc-500 flex flex-wrap gap-2">
                                            <span>
                                                Dep: {typeof user.totalDeposited === 'number' ? `$${user.totalDeposited.toFixed(0)}` : '—'}
                                            </span>
                                            <span>
                                                Wd: {typeof user.totalWithdrawn === 'number' ? `$${user.totalWithdrawn.toFixed(0)}` : '—'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <div className="text-xs text-muted-foreground">Geo / Status</div>
                                        <div className="text-sm text-zinc-200">{user.lastCountry || '—'}</div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {user.isAdmin ? (
                                                <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-100">
                                                    Admin
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                                                    User
                                                </Badge>
                                            )}
                                            {user.isDeleted ? (
                                                <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-100">
                                                    Deleted
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        user.isBanned
                                                            ? 'border-red-500/30 bg-red-500/10 text-red-100'
                                                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                                    }
                                                >
                                                    {user.isBanned ? 'Banned' : 'Active'}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <div className="text-xs text-muted-foreground">Timeline</div>
                                        <div className="text-xs text-zinc-300">
                                            Joined: {new Date(user.createdAt).toLocaleDateString()}
                                        </div>
                                        <div className="text-xs text-zinc-300 truncate">
                                            Last: {user.lastVisitedAt ? new Date(user.lastVisitedAt).toLocaleString() : '—'}
                                        </div>
                                    </div>

                                    <div className="md:col-span-1 flex md:justify-end gap-2 md:items-center">
                                        <a
                                            href={`/profile?address=${encodeURIComponent(user.address || user.id)}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-xs px-2 py-1 rounded-md border border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10"
                                        >
                                            Profile
                                        </a>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateUserMutation.mutate({
                                                        targetUserId: user.id,
                                                        action: user.isBanned ? 'unban' : 'ban',
                                                    });
                                                }}
                                                className={`text-xs px-2 py-1 rounded-md border transition-colors ${user.isBanned
                                                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'
                                                        : 'border-red-500/40 bg-red-500/10 text-red-100 hover:bg-red-500/20'
                                                    }`}
                                            >
                                                {user.isBanned ? 'Unban' : 'Ban'}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteUser(user);
                                                }}
                                                disabled={deleteUserMutation.isPending || user.isDeleted}
                                                className="text-xs px-2 py-1 rounded-md border border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {user.isDeleted ? 'Deleted' : 'Delete'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {users.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                {searchQuery ? 'No users found matching your search.' : 'No users found.'}
                            </div>
                        )}
                    </div>

                    {selectedUser && (
                        <div className="border-t-0 bg-surface-elevated px-4 py-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm text-muted-foreground">User details</div>
                                    <div className="text-lg font-semibold text-zinc-200">{selectedUser.name || selectedUser.username || 'User'}</div>
                                </div>
                                <button
                                    onClick={() => setSelectedUser(null)}
                                    className="text-muted-foreground hover:text-zinc-200 text-sm"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
                                <InfoRow label="ID" value={selectedUser.id} mono />
                                <InfoRow label="Address" value={selectedUser.address} mono />
                                <InfoRow label="Email" value={selectedUser.email || '—'} />
                                <InfoRow label="Username" value={selectedUser.username || '—'} />
                                <InfoRow label="Joined" value={new Date(selectedUser.createdAt).toLocaleDateString()} />
                                <InfoRow label="Events created" value={String(selectedUser._count.createdEvents)} />
                                <InfoRow label="Total activity" value={String(selectedUser._count.marketActivity)} />
                                <InfoRow label="Admin" value={selectedUser.isAdmin ? 'Yes' : 'No'} />
                                <InfoRow label="Status" value={selectedUser.isDeleted ? 'Deleted' : selectedUser.isBanned ? 'Banned' : 'Active'} />
                                <InfoRow label="Country" value={selectedUser.lastCountry || '—'} />
                                <InfoRow label="IP" value={selectedUser.lastIp || '—'} mono />
                                <InfoRow label="Device" value={selectedUser.lastDevice || '—'} />
                                <InfoRow label="OS" value={selectedUser.lastOs || '—'} />
                                <InfoRow label="User Agent" value={selectedUser.lastUserAgent || '—'} />
                                <InfoRow label="Last visited" value={selectedUser.lastVisitedAt ? new Date(selectedUser.lastVisitedAt).toLocaleString() : '—'} />
                                <InfoRow label="Balance" value={typeof selectedUser.currentBalance === 'number' ? `$${selectedUser.currentBalance.toFixed(2)}` : '—'} />
                                <InfoRow label="Total deposited" value={typeof selectedUser.totalDeposited === 'number' ? `$${selectedUser.totalDeposited.toFixed(2)}` : '—'} />
                                <InfoRow label="Total withdrawn" value={typeof selectedUser.totalWithdrawn === 'number' ? `$${selectedUser.totalWithdrawn.toFixed(2)}` : '—'} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {totalUsers > itemsPerPage && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                    totalItems={totalUsers}
                    itemsPerPage={itemsPerPage}
                />
            )}
        </div>
    );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex flex-col gap-1 rounded-lg border-0 bg-background p-3">
            <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
            <span className={`text-sm text-zinc-200 ${mono ? 'font-mono break-all' : ''}`}>{value}</span>
        </div>
    );
}
