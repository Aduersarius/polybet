'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const { data: usersData, isLoading } = useQuery({
        queryKey: ['admin', 'users', adminId, currentPage, searchQuery],
        queryFn: async () => {
            const params = new URLSearchParams({
                adminId,
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(searchQuery && { search: searchQuery })
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
    const activeCount = users.filter((u) => !u.isBanned).length;
    const adminCount = users.filter((u) => u.isAdmin).length;
    const bannedCount = users.filter((u) => u.isBanned).length;


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
        if (confirm(`Are you sure you want to delete user "${user.username || user.email || user.address}"? This action cannot be undone.`)) {
            deleteUserMutation.mutate(user.id);
        }
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        setSelectedUser(null); // Clear selected user when changing pages
    };

    if (isLoading) {
        return (
            <Card className="border-white/10 bg-[#0d0f14]">
                <CardHeader>
                    <CardTitle className="text-white">Users</CardTitle>
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
            <Card className="border-white/10 bg-[#0d0f14]">
                <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-white">Users</CardTitle>
                            <CardDescription>Manage members, roles, and status</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                            <Badge variant="outline" className="border-white/10 bg-white/5 text-white">
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
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by name, username, email, or address..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 pl-10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <svg
                                className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        {searchQuery && (
                            <div className="text-sm text-gray-400">
                                Found {totalUsers} users
                            </div>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-200">
                            <thead className="bg-white/5 text-xs uppercase text-gray-400 border-b border-white/10">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">User</th>
                                    <th className="px-4 py-3 font-semibold">Email</th>
                                    <th className="px-4 py-3 font-semibold">Events</th>
                                    <th className="px-4 py-3 font-semibold">Activity</th>
                                    <th className="px-4 py-3 font-semibold">Country</th>
                                    <th className="px-4 py-3 font-semibold">Balance</th>
                                    <th className="px-4 py-3 font-semibold">Joined</th>
                                    <th className="px-4 py-3 font-semibold">Last seen</th>
                                    <th className="px-4 py-3 font-semibold">Admin</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {users.map((user) => (
                                    <tr
                                        key={user.id}
                                        className="hover:bg-white/5 transition-colors"
                                        onClick={() => setSelectedUser(user === selectedUser ? null : user)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-white">
                                                    {user.name || user.username || (user.address ? `${user.address.slice(0, 12)}...` : '—')}
                                                </span>
                                                <span className="text-xs text-gray-400 font-mono">
                                                    {user.address ? `${user.address.slice(0, 10)}…` : '—'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-300">{user.email || '—'}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-100">
                                                {user._count.createdEvents}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-100">
                                                {user._count.marketActivity}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-200">
                                            {user.lastCountry || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-200">
                                            {typeof user.currentBalance === 'number'
                                                ? `$${user.currentBalance.toFixed(2)}`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-300">
                                            {new Date(user.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-300">
                                            {user.lastVisitedAt ? new Date(user.lastVisitedAt).toLocaleString() : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {user.isAdmin ? (
                                                <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-100">
                                                    Admin
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-gray-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge
                                                variant="outline"
                                                className={user.isBanned
                                                    ? 'border-red-500/30 bg-red-500/10 text-red-100'
                                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}
                                            >
                                                {user.isBanned ? 'Banned' : 'Active'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateUserMutation.mutate({
                                                            targetUserId: user.id,
                                                            action: user.isBanned ? 'unban' : 'ban'
                                                        });
                                                    }}
                                                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                                        user.isBanned
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
                                                    disabled={deleteUserMutation.isPending}
                                                    className="text-xs px-2 py-1 rounded-md border border-white/15 bg-white/5 text-gray-100 hover:bg-white/10 disabled:opacity-50"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedUser && (
                        <div className="border-t border-white/10 bg-white/5 px-4 py-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm text-gray-400">User details</div>
                                    <div className="text-lg font-semibold text-white">{selectedUser.name || selectedUser.username || 'User'}</div>
                                </div>
                                <button
                                    onClick={() => setSelectedUser(null)}
                                    className="text-gray-400 hover:text-white text-sm"
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
                                <InfoRow label="Status" value={selectedUser.isBanned ? 'Banned' : 'Active'} />
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

                    {users.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            {searchQuery ? 'No users found matching your search.' : 'No users found.'}
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
        <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-white/5 p-3">
            <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
            <span className={`text-sm text-white ${mono ? 'font-mono break-all' : ''}`}>{value}</span>
        </div>
    );
}
