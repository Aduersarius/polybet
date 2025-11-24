'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AdminEvent {
    id: string;
    title: string;
    status: string;
    isHidden: boolean;
    creator: {
        username: string | null;
        address: string;
    };
    _count: {
        bets: number;
    };
    createdAt: string;
}

export function AdminEventList() {
    const { user } = useUser();
    const queryClient = useQueryClient();

    const { data: events, isLoading } = useQuery({
        queryKey: ['admin', 'events', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const res = await fetch(`/api/admin/events?adminId=${user.id}`);
            if (!res.ok) throw new Error('Failed to fetch events');
            return res.json() as Promise<AdminEvent[]>;
        },
        enabled: !!user?.id,
    });

    const updateEventMutation = useMutation({
        mutationFn: async ({ eventId, action, value }: { eventId: string; action: string; value: any }) => {
            const res = await fetch('/api/admin/events', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId: user?.id, eventId, action, value }),
            });
            if (!res.ok) throw new Error('Failed to update event');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
        },
    });

    if (isLoading) return <div className="text-white">Loading events...</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-white/5 text-gray-200 uppercase">
                    <tr>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Creator</th>
                        <th className="px-4 py-3">Bets</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Hidden</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                    {events?.map((event) => (
                        <tr key={event.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 font-medium text-white">{event.title}</td>
                            <td className="px-4 py-3">
                                {event.creator.username || event.creator.address.slice(0, 6) + '...'}
                            </td>
                            <td className="px-4 py-3">{event._count.bets}</td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${event.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                    {event.status}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${event.isHidden ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                                    }`}>
                                    {event.isHidden ? 'Yes' : 'No'}
                                </span>
                            </td>
                            <td className="px-4 py-3 space-x-2">
                                <button
                                    onClick={() => updateEventMutation.mutate({
                                        eventId: event.id,
                                        action: 'toggleHide',
                                        value: !event.isHidden
                                    })}
                                    className="text-blue-400 hover:text-blue-300"
                                >
                                    {event.isHidden ? 'Unhide' : 'Hide'}
                                </button>
                                {event.status === 'ACTIVE' && (
                                    <>
                                        <button
                                            onClick={() => updateEventMutation.mutate({
                                                eventId: event.id,
                                                action: 'resolve',
                                                value: 'YES'
                                            })}
                                            className="text-green-400 hover:text-green-300"
                                        >
                                            Resolve YES
                                        </button>
                                        <button
                                            onClick={() => updateEventMutation.mutate({
                                                eventId: event.id,
                                                action: 'resolve',
                                                value: 'NO'
                                            })}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            Resolve NO
                                        </button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
