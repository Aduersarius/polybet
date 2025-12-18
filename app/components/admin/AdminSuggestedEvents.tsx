'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Pagination } from './Pagination';

interface EventSuggestion {
    id: string;
    title: string;
    description: string;
    categories: string[];
    imageUrl?: string | null;
    resolutionDate: string;
    type: string;
    status: 'PENDING' | 'APPROVED' | 'DECLINED';
    createdAt: string;
    reviewedAt?: string | null;
    reviewNote?: string | null;
    approvedEventId?: string | null;
    user: {
        id: string;
        username?: string | null;
        email?: string | null;
        address?: string | null;
    };
    outcomes?: { name: string; probability?: number }[] | null;
}

export function AdminSuggestedEvents() {
    const queryClient = useQueryClient();
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'DECLINED'>('PENDING');
    const itemsPerPage = 10;

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'suggestions', currentPage, searchQuery, statusFilter],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                status: statusFilter,
                ...(searchQuery && { search: searchQuery })
            });
            const res = await fetch(`/api/admin/event-suggestions?${params}`);
            if (!res.ok) throw new Error('Failed to fetch suggestions');
            return res.json() as Promise<{ suggestions: EventSuggestion[]; total: number }>;
        },
    });

    const suggestions = data?.suggestions || [];
    const total = data?.total || 0;

    const reviewMutation = useMutation({
        mutationFn: async ({ suggestionId, action }: { suggestionId: string; action: 'approve' | 'decline' }) => {
            const res = await fetch('/api/admin/event-suggestions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suggestionId, action }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to update suggestion');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'suggestions'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
        },
        onError: (error: any) => {
            alert(error?.message || 'Failed to update suggestion');
        }
    });

    if (isLoading) {
        return <div className="text-white">Loading suggestions...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 justify-between items-center">
                <div className="flex gap-2">
                    {(['PENDING', 'APPROVED', 'DECLINED'] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => { setStatusFilter(status); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === status
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'
                                }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
                <div className="flex-1 min-w-[220px] max-w-sm relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        placeholder="Search suggestions..."
                        className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>
            </div>

            <div className="overflow-hidden border border-white/10 rounded-xl bg-zinc-800">
                {suggestions.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">No suggestions yet.</div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {suggestions.map((suggestion) => (
                            <div key={suggestion.id} className="p-4 hover:bg-[#242424] transition-colors">
                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg font-semibold text-white">{suggestion.title}</span>
                                            <span className="text-xs px-2 py-1 rounded-full bg-[#2a2a2a] text-gray-300">
                                                {suggestion.type === 'MULTIPLE' ? 'Multiple' : 'Binary'}
                                            </span>
                                            <span className={`text-xs px-2 py-1 rounded-full ${suggestion.status === 'PENDING'
                                                ? 'bg-yellow-500/20 text-yellow-400'
                                                : suggestion.status === 'APPROVED'
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-red-500/20 text-red-400'
                                                }`}>
                                                {suggestion.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-300 mb-2 line-clamp-2">{suggestion.description}</p>
                                        <div className="flex flex-wrap gap-2 text-xs text-gray-400 mb-2">
                                            {suggestion.categories?.map((cat) => (
                                                <span key={cat} className="px-2 py-1 rounded bg-[#2a2a2a]">{cat}</span>
                                            ))}
                                        </div>
                                        {suggestion.outcomes && suggestion.outcomes.length > 0 && (
                                            <div className="text-xs text-gray-400 mb-2">
                                                <span className="font-semibold text-gray-300 mr-1">Outcomes:</span>
                                                {suggestion.outcomes.map((o, idx) => (
                                                    <span key={idx} className="mr-2">
                                                        {o.name}{typeof o.probability === 'number' ? ` (${Math.round(o.probability * 100)}%)` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="text-xs text-gray-400">
                                            Resolution: {new Date(suggestion.resolutionDate).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            Submitted by: {suggestion.user.username || suggestion.user.email || suggestion.user.address || 'User'}
                                        </div>
                                        {suggestion.reviewNote && (
                                            <div className="text-xs text-gray-400 mt-1">
                                                Note: {suggestion.reviewNote}
                                            </div>
                                        )}
                                        {suggestion.approvedEventId && (
                                            <div className="text-xs text-green-400 mt-1">
                                                Published as:{' '}
                                                <Link href={`/event/${suggestion.approvedEventId}`} className="underline">
                                                    {suggestion.approvedEventId}
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {suggestion.status === 'PENDING' ? (
                                            <>
                                                <button
                                                    onClick={() => reviewMutation.mutate({ suggestionId: suggestion.id, action: 'approve' })}
                                                    className="px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-500 transition-colors"
                                                    disabled={reviewMutation.isPending}
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => reviewMutation.mutate({ suggestionId: suggestion.id, action: 'decline' })}
                                                    className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
                                                    disabled={reviewMutation.isPending}
                                                >
                                                    Decline
                                                </button>
                                            </>
                                        ) : (
                                            <div className="text-xs text-gray-400">
                                                Reviewed {suggestion.reviewedAt ? new Date(suggestion.reviewedAt).toLocaleString() : ''}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {total > itemsPerPage && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(total / itemsPerPage)}
                    totalItems={total}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                />
            )}
        </div>
    );
}





