'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Message {
    id: string;
    text: string;
    createdAt: string;
    user: {
        address: string;
        username: string | null;
    };
}

interface EventChatProps {
    eventId: string;
}

export function EventChat({ eventId }: EventChatProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [inputText, setInputText] = useState('');
    const { address, isConnected } = useAccount();
    const queryClient = useQueryClient();

    // Fetch messages
    const { data: messages = [] } = useQuery<Message[]>({
        queryKey: ['messages', eventId],
        queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}/messages`);
            if (!res.ok) throw new Error('Failed to fetch messages');
            return res.json();
        },
        refetchInterval: 3000, // Poll every 3 seconds
    });

    // Send message mutation
    const sendMessageMutation = useMutation({
        mutationFn: async (text: string) => {
            const res = await fetch(`/api/events/${eventId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, address }),
            });
            if (!res.ok) throw new Error('Failed to send message');
            return res.json();
        },
        onSuccess: () => {
            setInputText('');
            queryClient.invalidateQueries({ queryKey: ['messages', eventId] });
        },
    });

    const handleSend = () => {
        if (!inputText.trim() || !isConnected || !address) return;
        sendMessageMutation.mutate(inputText);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString();
    };

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    return (
        <div className="material-card p-4 flex flex-col h-full min-h-[400px]">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-[#03dac6] rounded-full animate-pulse"></span>
                Live Chat
            </h3>

            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[400px] pr-2 custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-10 text-sm">
                        No messages yet. Be the first to say hi!
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`rounded p-3 ${msg.user.address === address ? 'bg-[#3a3a3a] border border-[#bb86fc]/20' : 'bg-[#2c2c2c]'}`}>
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-xs font-mono ${msg.user.address === address ? 'text-[#bb86fc]' : 'text-gray-400'}`}>
                                    {msg.user.username || formatAddress(msg.user.address)}
                                </span>
                                <span className="text-[10px] text-gray-500">{formatTime(msg.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-300 break-words">{msg.text}</p>
                        </div>
                    ))
                )}
            </div>

            <div className="flex gap-2">
                {isConnected ? (
                    <>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            className="flex-1 bg-[#2c2c2c] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#bb86fc] transition-all placeholder-gray-600"
                            disabled={sendMessageMutation.isPending}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputText.trim() || sendMessageMutation.isPending}
                            className="bg-[#bb86fc] hover:bg-[#a66ef1] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            {sendMessageMutation.isPending ? '...' : 'Send'}
                        </button>
                    </>
                ) : (
                    <div className="w-full text-center p-2 bg-[#2c2c2c] rounded-lg text-sm text-gray-400">
                        Connect wallet to chat
                    </div>
                )}
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
