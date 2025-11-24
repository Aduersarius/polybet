'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AdminUser {
    id: string;
    address: string;
    username: string | null;
    isBanned: boolean;
    _count: {
        bets: number;
        createdEvents: number;
    };
    createdAt: string;
}

export function AdminUserList() {
    const { user } = useUser();
    const queryClient = useQueryClient();

    const { data: users, isLoading } = useQuery({
        queryKey: ['admin', 'users', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const res = await fetch(`/api/admin/users?adminId=${user.id}`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json() as Promise<AdminUser[]>;
        },
        enabled: !!user?.id,
    });

    const updateUserMutation = useMutation({
        mutationFn: async ({ targetUserId, action }: { targetUserId: string; action: string }) => {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId: user?.id, targetUserId, action }),
            });
            if (!res.ok) throw new Error('Failed to update user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });

    if (isLoading) return <div className="text-white">Loading users...</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-white/5 text-gray-200 uppercase">
                    <tr>
                        <th className="px-4 py-3">Username/Address</th>
                        <th className="px-4 py-3">Created Events</th>
                        <th className="px-4 py-3">Bets Placed</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                    {users?.map((user) => (
                        <tr key={user.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 font-medium text-white">
                                {user.username || user.address}
                            </td>
                            <td className="px-4 py-3">{user._count.createdEvents}</td>
                            <td className="px-4 py-3">{user._count.bets}</td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${user.isBanned ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                                    }`}>
                                    {user.isBanned ? 'Banned' : 'Active'}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <button
                                    onClick={() => updateUserMutation.mutate({
                                        targetUserId: user.id,
                                        action: user.isBanned ? 'unban' : 'ban'
                                    })}
                                    className={`${user.isBanned ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'
                                        }`}
                                >
                                    {user.isBanned ? 'Unban' : 'Ban'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
