'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Pagination } from './Pagination';

interface AdminUser {
    id: string;
    address: string;
    username: string | null;
    email: string | null;
    name: string | null;
    isBanned: boolean;
    isAdmin: boolean;
    _count: {
        bets: number;
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

    // Since filtering is now done server-side, filteredUsers is just users
    const filteredUsers = users;


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

    if (isLoading) return <div className="text-white">Loading users...</div>;

    return (
        <div className="space-y-4 relative z-10">
            {/* Search Bar */}
            <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, username, email, or address..."
                        className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2 pl-10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
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
                        Found {totalUsers} users matching "{searchQuery}"
                    </div>
                )}
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto bg-[#1e1e1e]">
                <table className="w-full text-left text-sm text-gray-400 bg-[#1e1e1e]">
                    <thead className="bg-[#2a2a2a] text-gray-200 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">User</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Events</th>
                            <th className="px-4 py-3">Bets</th>
                            <th className="px-4 py-3">Joined</th>
                            <th className="px-4 py-3">Admin</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-[#1e1e1e]">
                        {filteredUsers?.map((user) => (
                            <tr
                                key={user.id}
                                className="hover:bg-[#2a2a2a] cursor-pointer transition-colors group bg-[#1e1e1e]"
                                onClick={() => setSelectedUser(user === selectedUser ? null : user)}
                            >
                                <td className="px-4 py-3">
                                    <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                                        {user.name || user.username || user.address.slice(0, 12) + '...'}
                                    </div>
                                </td>
                                <td className="px-4 py-3">{user.email || '—'}</td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-cyan-400">
                                        {user._count.createdEvents}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-blue-400">
                                        {user._count.bets}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3">
                                    {user.isAdmin && (
                                        <span className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-purple-400">
                                            ★ Admin
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${user.isBanned
                                        ? 'bg-[#2a2a2a] text-red-400'
                                        : 'bg-[#2a2a2a] text-green-400'
                                        }`}>
                                        {user.isBanned ? '🚫 Banned' : '✓ Active'}
                                    </span>
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
                                            className={`text-xs px-2 py-1 rounded-md transition-all duration-150 shadow-sm hover:shadow-md border border-gray-600 ${user.isBanned
                                                ? 'bg-[#065f46] text-gray-200 hover:bg-[#047857] active:bg-[#065f46]'
                                                : 'bg-[#991b1b] text-gray-200 hover:bg-[#dc2626] active:bg-[#991b1b]'
                                                }`}
                                        >
                                            {user.isBanned ? '✓ Unban' : '🚫 Ban'}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteUser(user);
                                            }}
                                            disabled={deleteUserMutation.isPending}
                                            className="text-xs px-2 py-1 rounded-md bg-[#374151] text-gray-200 hover:bg-[#4b5563] active:bg-[#374151] transition-all duration-150 shadow-sm hover:shadow-md border border-gray-600 disabled:opacity-50"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* User Details Panel (shown when row is clicked) */}
                {selectedUser && (
                    <div className="mt-6 p-4 bg-[#2a2a2a] border border-white/10 rounded-lg">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold text-white">User Details</h3>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-400">ID:</span>
                                <p className="text-white font-mono text-xs">{selectedUser.id}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Name:</span>
                                <p className="text-white">{selectedUser.name || '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Username:</span>
                                <p className="text-white">{selectedUser.username || '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Email:</span>
                                <p className="text-white">{selectedUser.email || '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Address:</span>
                                <p className="text-white font-mono text-xs">{selectedUser.address}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Joined:</span>
                                <p className="text-white">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Events Created:</span>
                                <p className="text-white">{selectedUser._count.createdEvents}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">Total Bets:</span>
                                <p className="text-white">{selectedUser._count.bets}</p>
                            </div>
                        </div>
                    </div>
                )}

                {filteredUsers.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        {searchQuery ? 'No users found matching your search.' : 'No users found.'}
                    </div>
                )}
            </div>

            {/* Pagination */}
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
