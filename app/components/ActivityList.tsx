'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface Trade {
    id: string;
    amount: number;
    option: 'YES' | 'NO';
    createdAt: string;
    user: {
        username: string | null;
        address: string;
        avatarUrl: string | null;
    };
}

interface ActivityListProps {
    eventId: string;
}

export function ActivityList({ eventId }: ActivityListProps) {
    const { data: trades = [], isLoading } = useQuery<Trade[]>({
        queryKey: ['trades', eventId],
        queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}/bets`);
            if (!res.ok) throw new Error('Failed to fetch trades');
            return res.json();
        },
        refetchInterval: 5000, // Poll every 5 seconds
    });

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#bb86fc]"></div>
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
            <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar max-h-[400px]">
                {trades.map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-colors group border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {trade.user.avatarUrl ? (
                                    <img
                                        src={trade.user.avatarUrl}
                                        alt="Avatar"
                                        className="w-8 h-8 rounded-full object-cover border border-white/10"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                        {(trade.user.username?.[0] || trade.user.address.slice(2, 3)).toUpperCase()}
                                    </div>
                                )}
                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-[#1e1e1e] text-[8px] font-bold ${trade.option === 'YES' ? 'bg-[#03dac6] text-black' : 'bg-[#cf6679] text-white'
                                    }`}>
                                    {trade.option === 'YES' ? 'Y' : 'N'}
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                    <a href={`/user/${trade.user.address}`} className="text-sm font-medium text-gray-200 hover:text-[#bb86fc] hover:underline transition-colors">
                                        {trade.user.username || formatAddress(trade.user.address)}
                                    </a>
                                    <span className="text-xs text-gray-500">bought</span>
                                    <span className={`text-sm font-bold ${trade.option === 'YES' ? 'text-[#03dac6]' : 'text-[#cf6679]'
                                        }`}>
                                        {trade.option}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    ${trade.amount.toFixed(2)}
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-gray-500 font-mono">
                            {formatDistanceToNow(new Date(trade.createdAt), { addSuffix: true }).replace('about ', '')}
                        </div>
                    </div>
                ))}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}
