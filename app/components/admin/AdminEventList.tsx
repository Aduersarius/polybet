'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        address?: string | null;
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
    const debouncedSearch = useDebounce(searchQuery, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    const { data: eventsData, isLoading } = useQuery({
        queryKey: ['admin', 'events', adminId, currentPage, debouncedSearch],
        queryFn: async () => {
            const params = new URLSearchParams({
                adminId,
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(debouncedSearch && { search: debouncedSearch })
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


    if (isLoading) {
        return (
            <Card className="border-0 bg-surface">
                <CardHeader>
                    <CardTitle className="text-zinc-200">Events</CardTitle>
                    <CardDescription>Loading events…</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-0 bg-surface">
            <CardHeader className="gap-2">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-zinc-200">Events</CardTitle>
                        <CardDescription className="text-muted-foreground">Manage markets, visibility, and status</CardDescription>
                    </div>
                    {debouncedSearch && (
                        <div className="text-sm text-muted-foreground">Found {totalEvents} events</div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, description, categories, creator, status, or type..."
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
                </div>
            </CardHeader>

            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-zinc-200">
                        <thead className="bg-white/5 text-xs uppercase text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Title</th>
                                <th className="px-4 py-3 font-semibold">Type</th>
                                <th className="px-4 py-3 font-semibold">Categories</th>
                                <th className="px-4 py-3 font-semibold">Creator</th>
                                <th className="px-4 py-3 font-semibold">Bets</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Visibility</th>
                                <th className="px-4 py-3 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {events?.map((event, idx) => {
                                if (!event) return null;

                                const addr = event.creator?.address || '';
                                const shortAddress = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Unknown';
                                const creatorLabel = event.creator?.username || shortAddress;
                                const categories = Array.isArray(event.categories) ? event.categories : [];

                                return (
                                    <tr
                                        key={event.id || `event-${idx}`}
                                        className="hover:bg-white/5 cursor-pointer transition-colors"
                                        onClick={() => onEditEvent(event)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-zinc-200 hover:text-primary transition-colors">
                                                {event.title}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 rounded-full text-xs bg-white/5 text-cyan-300 border border-cyan-500/20">
                                                {event.type === 'BINARY' ? 'Binary' : 'Multiple'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {categories.slice(0, 2).map((cat, idx) => (
                                                    <span key={idx} className="px-2 py-1 rounded-full text-xs bg-white/5 text-zinc-300 border border-white/5">
                                                        {cat}
                                                    </span>
                                                ))}
                                                {categories.length > 2 && (
                                                    <span className="px-2 py-1 rounded-full text-xs bg-white/5 text-muted-foreground border border-white/5">
                                                        +{categories.length - 2}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-400">
                                            {creatorLabel}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 rounded-full text-xs bg-primary/10 border border-primary/30 text-blue-100">
                                                {event._count.bets}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${event.status === 'ACTIVE'
                                                ? 'bg-emerald-500/10 text-emerald-100 border-emerald-500/30'
                                                : 'bg-white/5 text-muted-foreground border-white/5'
                                                }`}>
                                                {event.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${event.isHidden
                                                ? 'bg-red-500/10 text-red-100 border-red-500/30'
                                                : 'bg-emerald-500/10 text-emerald-100 border-emerald-500/30'
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
                                                    className="text-xs px-2 py-1 rounded-md border border-white/5 bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors"
                                                >
                                                    {event.isHidden ? 'Show' : 'Hide'}
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
                                                            className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
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
                                                            className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-100 hover:bg-red-500/20 border border-red-500/30 transition-colors"
                                                        >
                                                            ✗ NO
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Delete this event? This will unmap any Polymarket link.')) {
                                                            updateEventMutation.mutate({
                                                                eventId: event.id,
                                                                action: 'delete',
                                                                value: true
                                                            });
                                                            // Refresh events and polymarket intake views
                                                            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
                                                            queryClient.invalidateQueries({ queryKey: ['polymarket', 'intake'] });
                                                        }
                                                    }}
                                                    className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-100 hover:bg-red-500/20 border border-red-500/30 transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {events.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            {debouncedSearch ? 'No events found matching your search.' : 'No events found. Create your first event!'}
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
            </CardContent>
        </Card>
    );
}