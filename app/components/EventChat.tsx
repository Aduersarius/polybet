'use client';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { UserHoverCard } from './UserHoverCard';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Discussion,
    DiscussionItem,
    DiscussionContent,
    DiscussionTitle,
    DiscussionBody,
    DiscussionExpand,
    DiscussionReplies,
} from '@/components/molecule-ui/discussion';
import { Button } from '@/components/ui/button';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/solid';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface Message {
    id: string;
    text: string;
    createdAt: string;
    editedAt?: string | null;
    isDeleted?: boolean;
    parentId?: string | null;
    userId: string;
    user: {
        address?: string;
        username: string | null;
        avatarUrl: string | null;
        image: string | null;
        bets?: {
            option: string;
            amount: number;
        }[];
    };
    reactions: Record<string, string[]>;
    replyCount: number;
}

interface EventChatProps {
    eventId: string;
}

export function EventChat({ eventId }: EventChatProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [inputText, setInputText] = useState('');
    const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

    // Mock user for dev - in real app use auth context
    const user = { id: 'dev-user', username: 'Dev User' };

    // Fetch latest messages as a simple flat list (no client-side pagination)
    const {
        data,
        isLoading,
        refetch,
    } = useQuery<{ messages: Message[] }>({
        queryKey: ['messages', eventId],
        queryFn: async () => {
            const params = new URLSearchParams({
                limit: '50', // Load up to 50 latest messages
            });
            const res = await fetch(`/api/events/${eventId}/messages?${params}`);
            if (!res.ok) throw new Error('Failed to fetch messages');
            return res.json();
        },
    });

    const messages: Message[] = data?.messages || [];

    // Real-time updates
    useEffect(() => {
        const { socket } = require('@/lib/socket');
        function onMessage() {
            // Refetch first page to get new messages
            refetch();
        }
        socket.on(`chat-message-${eventId}`, onMessage);
        return () => {
            socket.off(`chat-message-${eventId}`, onMessage);
        };
    }, [eventId, refetch]);

    // Auto-scroll to bottom when new messages arrive (only if user is near bottom)
    useEffect(() => {
        if (!data || isLoading) return;

        const scrollArea = scrollContainerRef.current?.closest('[data-radix-scroll-area-root]');
        const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;

        if (viewport) {
            // Check if user is near bottom (within 100px)
            const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;

            if (isNearBottom) {
                // Scroll to bottom
                setTimeout(() => {
                    viewport.scrollTop = viewport.scrollHeight;
                }, 100);
            }
        }
    }, [messages.length, isLoading]);

    // Group messages
    const rootMessages = messages.filter(m => !m.parentId);
    const messageMap = new Map<string, Message[]>();
    messages.forEach(msg => {
        if (msg.parentId) {
            if (!messageMap.has(msg.parentId)) {
                messageMap.set(msg.parentId, []);
            }
            messageMap.get(msg.parentId)!.push(msg);
        }
    });

    const reactMutation = useMutation({
        mutationFn: async ({ messageId, type }: { messageId: string; type: 'LIKE' | 'DISLIKE' }) => {
            const res = await fetch(`/api/messages/${messageId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });
            if (!res.ok) throw new Error('Failed to react to message');
            return res.json();
        },
        onSuccess: () => {
            // Refresh messages so reaction counts stay in sync
            refetch();
        },
    });

    const sendMessageMutation = useMutation({
        mutationFn: async (text: string) => {
            const res = await fetch(`/api/events/${eventId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    userId: user?.id,
                    parentId: replyTo?.id
                }),
            });
            if (!res.ok) throw new Error('Failed to send message');
            return res.json();
        },
        onSuccess: () => {
            setInputText('');
            setReplyTo(null);
            // Refetch to show new message
            refetch();
        },
    });

    const handleSend = () => {
        if (!inputText.trim() || !user?.id) return;
        sendMessageMutation.mutate(inputText);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return date.toLocaleDateString();
    };

    const formatDisplayName = (userObj: Message['user'], userId: string) => {
        if (userObj.username) return userObj.username;
        if (userObj.address) return `${userObj.address.slice(0, 4)}...${userObj.address.slice(-4)}`;
        return `User ${userId.slice(0, 4)}`;
    };

    const getAvatarFallback = (userObj: Message['user'], userId: string) => {
        if (userObj.username) return userObj.username[0].toUpperCase();
        if (userObj.address) return userObj.address.slice(2, 3).toUpperCase();
        const initial = userId[0].toUpperCase();
        return isNaN(parseInt(initial)) ? initial : 'U';
    };

    // Helper function to get avatar URL with fallback
    const getAvatarUrl = (userObj: Message['user']): string | undefined => {
        const url = userObj.avatarUrl || userObj.image;
        // Return undefined if url is null, empty string, or undefined
        return url && url.trim() !== '' ? url : undefined;
    };

    return (
        <div className="flex flex-col">
            {/* Header - Comments count */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-zinc-300">
                    Comments ({rootMessages.length})
                </span>
            </div>

            {/* Input Area */}
            <div className="relative mb-4">
                {replyTo && (
                    <div className="flex items-center justify-between bg-zinc-700/50 px-3 py-1.5 rounded-t-lg border-b border-white/5 text-xs text-zinc-400">
                        <span>Replying to <span className="text-accent-400">@{replyTo.username}</span></span>
                        <button onClick={() => setReplyTo(null)} className="hover:text-white">&times;</button>
                    </div>
                )}
                <div className={`flex gap-2 bg-zinc-900/80 p-2 rounded-lg border border-zinc-700/50 ${replyTo ? 'rounded-t-none' : ''}`}>
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={replyTo ? "Write a reply..." : "Type a message..."}
                        className="flex-1 bg-transparent text-sm focus:outline-none text-white placeholder-zinc-500 px-2"
                        disabled={sendMessageMutation.isPending}
                    />
                    <Button
                        onClick={handleSend}
                        isDisabled={!inputText.trim() || sendMessageMutation.isPending}
                        className="bg-accent-500 text-white hover:bg-accent-600 h-8 px-4 text-sm font-medium"
                        size="sm"
                    >
                        {sendMessageMutation.isPending ? '...' : 'Send'}
                    </Button>
                </div>
            </div>

            {/* Messages Area - compact height */}
            <ScrollArea className="max-h-[280px] pr-2">
                <div ref={scrollContainerRef} className="flex flex-col">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-24">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-500"></div>
                        </div>
                    ) : rootMessages.length === 0 ? (
                        <div className="text-center text-zinc-500 py-8 text-sm">No messages yet. Be the first to say hi!</div>
                    ) : (
                        <>
                            <Discussion type="multiple" className="space-y-4">
                                {rootMessages.map((msg) => {
                                    const replies = messageMap.get(msg.id) || [];
                                    const isMe = msg.userId === user?.id;
                                    const displayName = formatDisplayName(msg.user, msg.userId);
                                    const avatarFallback = getAvatarFallback(msg.user, msg.userId);
                                    const likeCount = msg.reactions?.LIKE?.length || 0;
                                    const dislikeCount = msg.reactions?.DISLIKE?.length || 0;

                                    const profileAddress = msg.user.address || msg.userId;

                                    // Use the most recent bet for this event if available
                                    const latestBet = msg.user.bets && msg.user.bets.length > 0
                                        ? msg.user.bets[0]
                                        : null;

                                    return (
                                        <DiscussionItem key={msg.id} value={msg.id}>
                                            <DiscussionContent className="gap-3 items-start">
                                                <UserHoverCard address={profileAddress}>
                                                    <Link href={`/profile?address=${profileAddress}`} className="cursor-pointer">
                                                        <Avatar className="w-7 h-7 border border-zinc-700">
                                                            {getAvatarUrl(msg.user) && (
                                                                <AvatarImage src={getAvatarUrl(msg.user)!} alt={displayName} />
                                                            )}
                                                            <AvatarFallback className="bg-gradient-to-br from-primary-500 to-accent-600 text-white font-bold text-xs">{avatarFallback}</AvatarFallback>
                                                        </Avatar>
                                                    </Link>
                                                </UserHoverCard>

                                                <div className="flex flex-col gap-1 w-full min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <UserHoverCard address={profileAddress}>
                                                            <Link href={`/profile?address=${profileAddress}`} className="cursor-pointer">
                                                                <DiscussionTitle className={`hover:underline text-sm font-semibold ${isMe ? 'text-accent-400' : 'text-zinc-100'}`}>
                                                                    {displayName}
                                                                </DiscussionTitle>
                                                            </Link>
                                                        </UserHoverCard>
                                                        <span className="text-[10px] text-zinc-500">{formatTime(msg.createdAt)}</span>

                                                        {latestBet && (
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${latestBet.option === 'YES'
                                                                    ? 'bg-secondary-500/10 text-secondary-400 border-secondary-500/40'
                                                                    : 'bg-error-500/10 text-error-400 border-error-500/40'
                                                                    }`}
                                                            >
                                                                <span>{latestBet.option}</span>
                                                                <span>${latestBet.amount.toFixed(2)}</span>
                                                            </span>
                                                        )}
                                                    </div>

                                                    <DiscussionBody className="text-sm text-zinc-300">
                                                        {msg.text}
                                                    </DiscussionBody>

                                                    <div className="flex items-center pt-1 text-xs text-zinc-500">
                                                        <button
                                                            onClick={() => setReplyTo({ id: msg.id, username: displayName })}
                                                            className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 group"
                                                        >
                                                            <ArrowUturnLeftIcon className="w-3 h-3 group-hover:text-accent-400" />
                                                            Reply
                                                        </button>

                                                        <div className="flex items-center gap-3 ml-4">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => reactMutation.mutate({ messageId: msg.id, type: 'LIKE' })}
                                                                    className="inline-flex items-center justify-center h-5 w-5 rounded-md border border-transparent hover:border-zinc-700 bg-transparent text-zinc-500 hover:text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                                    disabled={reactMutation.isPending}
                                                                >
                                                                    <ThumbsUp className="h-3 w-3" />
                                                                </button>
                                                                {likeCount > 0 && <span className="text-[10px]">{likeCount}</span>}
                                                            </div>

                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => reactMutation.mutate({ messageId: msg.id, type: 'DISLIKE' })}
                                                                    className="inline-flex items-center justify-center h-5 w-5 rounded-md border border-transparent hover:border-zinc-700 bg-transparent text-zinc-500 hover:text-error-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                                    disabled={reactMutation.isPending}
                                                                >
                                                                    <ThumbsDown className="h-3 w-3" />
                                                                </button>
                                                                {dislikeCount > 0 && <span className="text-[10px]">{dislikeCount}</span>}
                                                            </div>
                                                        </div>

                                                        {replies.length > 0 && (
                                                            <div className="ml-3">
                                                                <DiscussionExpand />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </DiscussionContent>

                                            {replies.length > 0 && (
                                                <DiscussionReplies>
                                                    <div className="space-y-3 py-2 pl-3 border-l border-zinc-700/50 ml-3">
                                                        {replies.map(reply => {
                                                            const replyDisplayName = formatDisplayName(reply.user, reply.userId);
                                                            const replyAvatarFallback = getAvatarFallback(reply.user, reply.userId);
                                                            return (
                                                                <div key={reply.id} className="flex gap-2">
                                                                    <UserHoverCard address={reply.user.address || reply.userId}>
                                                                        <div className="cursor-pointer shrink-0">
                                                                            <Avatar className="w-5 h-5 border border-zinc-700">
                                                                                {getAvatarUrl(reply.user) && (
                                                                                    <AvatarImage src={getAvatarUrl(reply.user)!} alt={replyDisplayName} />
                                                                                )}
                                                                                <AvatarFallback className="bg-zinc-700 text-white font-bold text-[9px]">{replyAvatarFallback}</AvatarFallback>
                                                                            </Avatar>
                                                                        </div>
                                                                    </UserHoverCard>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <UserHoverCard address={reply.user.address || reply.userId}>
                                                                                <span className="text-xs font-bold text-zinc-300 cursor-pointer hover:underline">{replyDisplayName}</span>
                                                                            </UserHoverCard>
                                                                            <span className="text-[10px] text-zinc-600">{formatTime(reply.createdAt)}</span>
                                                                        </div>
                                                                        <p className="text-sm text-zinc-400 mt-0.5">{reply.text}</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </DiscussionReplies>
                                            )}
                                        </DiscussionItem>
                                    );
                                })}
                            </Discussion>
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
