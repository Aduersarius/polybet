'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';
import { UserHoverCard } from './UserHoverCard';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

interface MarketActivity {
    id: string;
    amount: number;
    option: string | null;
    outcomeId: string | null;
    createdAt: string;
    user: {
        username: string | null;
        address: string;
        avatarUrl: string | null;
        image: string | null; // Include image field from Better Auth
    };
}

interface ActivityListProps {
    eventId: string;
}

export function ActivityList({ eventId }: ActivityListProps) {
    const queryClient = useQueryClient();
    const [cursor, setCursor] = useState<string | null>(null);
    const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);

    const { data: tradesData, isLoading, error } = useQuery<{
        bets: MarketActivity[];
        hasMore: boolean;
        nextCursor: string | null;
    }>({
        queryKey: ['trades', eventId, cursor],
        queryFn: async () => {
            const url = cursor
                ? `/api/events/${eventId}/bets?cursor=${cursor}&limit=10`
                : `/api/events/${eventId}/bets?limit=10`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error('Failed to fetch trades');
            }
            return res.json();
        },
        // Only poll on the first page to avoid shifting data while paginating
        refetchInterval: cursor ? false : 5000,
        retry: 3,
    });

    // Real-time updates via WebSocket (only invalidate if on first page)
    useEffect(() => {
        const handleOddsUpdate = (update: any) => {
            if (update.eventId === eventId && !cursor) {
                queryClient.invalidateQueries({ queryKey: ['trades', eventId] });
            }
        };

        socket.on('odds-update', handleOddsUpdate);

        return () => {
            socket.off('odds-update', handleOddsUpdate);
        };
    }, [eventId, queryClient, cursor]);

    const trades = tradesData?.bets || [];

    const formatAddress = (addr: string | null) => {
        if (!addr) return 'Unknown';
        return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };

    const handleNext = () => {
        if (tradesData?.nextCursor) {
            setCursorHistory(prev => [...prev, cursor]);
            setCursor(tradesData.nextCursor);
        }
    };

    const handlePrev = () => {
        if (cursorHistory.length > 0) {
            const prevCursor = cursorHistory[cursorHistory.length - 1];
            setCursorHistory(prev => prev.slice(0, -1));
            setCursor(prevCursor);
        }
    };

    const hasPrev = cursorHistory.length > 0;
    const hasNext = !!tradesData?.hasMore;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#bb86fc]"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center text-gray-500 py-10 text-sm">
                <div className="mb-2">🔄 Loading activity...</div>
                <div className="text-xs text-gray-600">If this persists, please refresh the page</div>
            </div>
        );
    }

    if (trades.length === 0) {
        return (
            <div className="text-center text-gray-500 py-10 text-sm">
                No activity yet. Be the first to trade!
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-[400px]">
            <div className="flex-1 space-y-0.5">
                {trades.map((trade) => {
                    // Ensure we have a valid address for UserHoverCard
                    const userAddress = trade.user.address || 'unknown';
                    const displayName = trade.user.username || formatAddress(trade.user.address);
                    const avatarUrl = trade.user.avatarUrl || trade.user.image;
                    
                    return (
                        <div key={trade.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group">
                            <div className="flex items-center gap-2">
                                <UserHoverCard address={userAddress}>
                                    <div className="relative cursor-pointer">
                                        <Avatar className="w-8 h-8 border border-white/10">
                                            {avatarUrl && (
                                                <AvatarImage 
                                                    src={avatarUrl} 
                                                    alt={displayName}
                                                />
                                            )}
                                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xs">
                                                {(trade.user.username?.[0] || (trade.user.address ? trade.user.address.slice(2, 3) : '?')).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-[#1e1e1e] text-[8px] font-bold ${trade.option === 'YES' ? 'bg-[#03dac6] text-black' : 'bg-[#cf6679] text-white'}`}>
                                            {trade.option === 'YES' ? 'Y' : 'N'}
                                        </div>
                                    </div>
                                </UserHoverCard>

                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                        <UserHoverCard address={userAddress}>
                                            <a className="text-xs font-bold text-gray-200 hover:text-[#bb86fc] hover:underline transition-colors cursor-pointer">
                                                {displayName}
                                            </a>
                                        </UserHoverCard>
                                        <span className="text-[10px] text-gray-500">bought</span>
                                        <span className={`text-xs font-bold ${trade.option === 'YES' ? 'text-[#03dac6]' : 'text-[#cf6679]'}`}>
                                            {trade.option}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-gray-400">
                                        ${trade.amount.toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            <div className="text-[10px] text-gray-600 font-mono">
                                {formatDistanceToNow(new Date(trade.createdAt), { addSuffix: true }).replace('about ', '')}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Pagination Controls */}
            <div className="border-t border-white/10 pt-2 mt-2">
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (hasPrev) handlePrev();
                                }}
                                className={!hasPrev ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                        <PaginationItem>
                            <span className="text-[10px] text-gray-500 px-2">
                                {trades.length} trades
                            </span>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (hasNext) handleNext();
                                }}
                                className={!hasNext ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        </div>
    );
}
