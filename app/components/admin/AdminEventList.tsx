 u'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pagination } from './Pagination';

interface AdminEvent {
    id: string;
    title: string;
    description: string;
    categories: string[];
    type: string;
    status: string;
    isHidden: boolean;
    imageUrl: string | null;
    resolutionDate: string;
    creator: {
        username: string | null;
        address: string;
    };
    _count: {
        bets: number;
    };
    createdAt: string;
}

interface AdminEventListProps {
    onEditEvent: (event: Partial<AdminEvent>) => void;
}

export function AdminEventList({ onEditEvent }: AdminEventListProps) {
    const adminId = 'dev-user';
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const { data: eventsData, isLoading } = useQuery({
        queryKey: ['admin', 'events', adminId, currentPage, searchQuery],
        queryFn: async () => {
            const params = new URLSearchParams({
                adminId,
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(searchQuery && { search: searchQuery })
            });
            const res = await fetch(`/api/admin/events?${params}`);
            if (!res.ok) throw new Error('Failed to fetch events');
            return res.json() as Promise<{ events: AdminEvent[]; total: number }>;
        },
    });

    const events = eventsData?.events || [];
    const totalEvents = eventsData?.total || 0;

    const updateEventMutation = useMutation({
        mutationFn: async ({ eventId, action, value }: { eventId: string; action: string; value: any }) => {
            const res = await fetch('/api/admin/events', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, eventId, action, value }),
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
        <div className="space-y-4 relative z-10">
            {/* Search Bar */}
            <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by title, description, categories, creator, status, or type..."
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
                        Found {totalEvents} events
                    </div>
                )}
            </div>

            {/* Events Table */}
            <div className="overflow-x-auto bg-[#1e1e1e]">
                <table className="w-full text-left text-sm text-gray-400 bg-[#1e1e1e]">
                    <thead className="bg-[#2a2a2a] text-gray-200 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Title</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Categories</th>
                            <th className="px-4 py-3">Creator</th>
                            <th className="px-4 py-3">Bets</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Visibility</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-[#1e1e1e]">
                        {events?.map((event) => (
                            <tr
                                key={event.id}
                                className="hover:bg-[#2a2a2a] cursor-pointer transition-colors group bg-[#1e1e1e]"
                                onClick={() => onEditEvent(event)}
                            >
                                <td className="px-4 py-3">
                                    <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                                        {event.title}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-cyan-400`}>
                                        {event.type === 'BINARY' ? 'Binary' : 'Multiple'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {event.categories?.slice(0, 2).map((cat, idx) => (
                                            <span key={idx} className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-gray-300">
                                                {cat}
                                            </span>
                                        ))}
                                        {event.categories?.length > 2 && (
                                            <span className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-gray-400">
                                                +{event.categories.length - 2}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-300">
                                    {event.creator.username || event.creator.address.slice(0, 6) + '...'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-blue-400">
                                        {event._count.bets}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${event.status === 'ACTIVE'
                                        ? 'bg-[#2a2a2a] text-green-400'
                                        : 'bg-[#2a2a2a] text-gray-400'
                                        }`}>
                                        {event.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${event.isHidden
                                        ? 'bg-[#2a2a2a] text-red-400'
                                        : 'bg-[#2a2a2a] text-green-400'
                                        }`}>
                                        {event.isHidden ? 'Hidden' : 'Public'}
                                    </span>
                                </td>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateEventMutation.mutate({
                                                    eventId: event.id,
                                                    action: 'toggleHide',
                                                    value: !event.isHidden
                                                });
                                            }}
                                            className="text-xs px-2 py-1 rounded-md bg-[#374151] text-gray-200 hover:bg-[#4b5563] active:bg-[#374151] transition-all duration-150 shadow-sm hover:shadow-md border border-gray-600"
                                        >
                                            {event.isHidden ? '👁️ Show' : '🚫 Hide'}
                                        </button>
                                        {event.status === 'ACTIVE' && (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Resolve this event as YES?')) {
                                                            updateEventMutation.mutate({
                                                                eventId: event.id,
                                                                action: 'resolve',
                                                                value: 'YES'
                                                            });
                                                        }
                                                    }}
                                                    className="text-xs px-2 py-1 rounded-md bg-[#065f46] text-gray-200 hover:bg-[#047857] active:bg-[#065f46] transition-all duration-150 shadow-sm hover:shadow-md border border-gray-600"
                                                >
                                                    ✓ YES
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Resolve this event as NO?')) {
                                                            updateEventMutation.mutate({
                                                                eventId: event.id,
                                                                action: 'resolve',
                                                                value: 'NO'
                                                            });
                                                        }
                                                    }}
                                                    className="text-xs px-2 py-1 rounded-md bg-[#991b1b] text-gray-200 hover:bg-[#dc2626] active:bg-[#991b1b] transition-all duration-150 shadow-sm hover:shadow-md border border-gray-600"
                                                >
                                                    ✗ NO
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {events.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        {searchQuery ? 'No events found matching your search.' : 'No events found. Create your first event!'}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalEvents > itemsPerPage && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalEvents / itemsPerPage)}
                    totalItems={totalEvents}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                />
            )}
        </div>
    );
}