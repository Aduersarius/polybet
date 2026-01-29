'use client';
import Link from 'next/link';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserHoverCard } from './UserHoverCard';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from '@/lib/auth-client';
import { toast } from '@/components/ui/use-toast';
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
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { generateAvatarDataUri } from '@/lib/avatar';

interface Message {
    id: string;
    text: string;
    createdAt: string;
    userId: string;
    user: {
        address?: string;
        username: string | null;
        avatarUrl: string | null;
        image: string | null;
        bets?: { option: string; amount: number; }[];
    };
    reactions: Record<string, string[]>;
    parentId?: string | null;
}

export function EventChat({ eventId: propEventId }: { eventId: string }) {
    const [mounted, setMounted] = useState(false);
    const [resolvedEventId, setResolvedEventId] = useState<string>(
        typeof propEventId === 'string' && propEventId.length === 36 ? propEventId : ''
    );

    useEffect(() => {
        setMounted(true);
        if (!propEventId || propEventId.length === 36) return;

        const controller = new AbortController();
        fetch(`/api/events/${propEventId}`, { signal: controller.signal })
            .then(res => res.json())
            .then(data => data?.id && setResolvedEventId(data.id))
            .catch(err => err.name !== 'AbortError' && console.error('[EventChat] ID resolution failed:', err));

        return () => controller.abort();
    }, [propEventId]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const observerTarget = useRef<HTMLDivElement>(null);
    const [inputText, setInputText] = useState('');
    const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const stableId = resolvedEventId || (typeof propEventId === 'string' && propEventId.length === 36 ? propEventId : '');

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        refetch
    } = useInfiniteQuery({
        // UNIQUE KEY IS THE FIX: Prevents collision with flat 'messages' cache
        queryKey: ['infinite-messages', stableId || 'none'],
        queryFn: async ({ pageParam }) => {
            if (!stableId) return { messages: [], nextCursor: null };
            const res = await fetch(`/api/events/${stableId}/messages?limit=10${pageParam ? `&cursor=${pageParam}` : ''}`);
            if (!res.ok) throw new Error('Failed to fetch messages');
            const d = await res.json();
            return {
                messages: Array.isArray(d?.messages) ? d.messages : [],
                nextCursor: d?.nextCursor ?? null
            };
        },
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        initialPageParam: null,
        enabled: mounted && !!stableId,
    });

    const messages = useMemo(() => data?.pages.flatMap(p => p.messages) ?? [], [data]);

    // Real-time invalidation
    useEffect(() => {
        if (!stableId) return;
        const { socket } = require('@/lib/socket');
        const channel = socket.subscribe(`event-${stableId}`);
        const onMessage = () => queryClient.invalidateQueries({ queryKey: ['infinite-messages', stableId] });
        channel.bind('chat-message', onMessage);
        return () => {
            channel.unbind('chat-message', onMessage);
            socket.unsubscribe(`event-${stableId}`);
        };
    }, [stableId, queryClient]);

    // Infinite scroll observer
    useEffect(() => {
        if (!mounted || !observerTarget.current || !hasNextPage || isFetchingNextPage) return;
        const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && fetchNextPage(), { threshold: 0.5 });
        observer.observe(observerTarget.current);
        return () => observer.disconnect();
    }, [mounted, hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Message organization (Grouping replies under roots)
    const { rootMessages, repliesMap } = useMemo(() => {
        const roots: Message[] = [];
        const replies = new Map<string, Message[]>();
        const msgMap = new Map<string, Message>(messages.map(m => [m.id, m]));

        messages.forEach(msg => {
            let root = msg;
            let depth = 0;
            while (root.parentId && depth < 5) {
                const parent = msgMap.get(root.parentId);
                if (!parent) break;
                root = parent;
                depth++;
            }
            if (!msg.parentId || root === msg) {
                roots.push(msg);
            } else {
                if (!replies.has(root.id)) replies.set(root.id, []);
                replies.get(root.id)!.push(msg);
            }
        });

        roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        replies.forEach(reps => reps.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        return { rootMessages: roots, repliesMap: replies };
    }, [messages]);

    const reactMutation = useMutation({
        mutationFn: async ({ messageId, type }: { messageId: string; type: 'LIKE' | 'DISLIKE' }) => {
            await fetch(`/api/messages/${messageId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });
        },
        onSuccess: () => refetch(),
    });

    const sendMutation = useMutation({
        mutationFn: async (text: string) => {
            const res = await fetch(`/api/events/${stableId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, parentId: replyTo?.id }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to send');
        },
        onSuccess: () => {
            setInputText('');
            setReplyTo(null);
            refetch();
        },
        onError: (err: any) => toast({ variant: 'destructive', title: 'Error', description: err.message }),
    });

    const formatDisplayName = (u: Message['user'], id: string) =>
        u.username || (u.address?.length ? `${u.address.slice(0, 4)}...${u.address.slice(-4)}` : `User ${id.slice(0, 4)}`);

    const formatTime = (ts: string) => {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
        return new Date(ts).toLocaleDateString();
    };

    if (!mounted) return (
        <div className="flex flex-col h-[150px] items-center justify-center">
            <Loader2 className="animate-spin h-6 w-6 text-accent-500" />
        </div>
    );

    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-zinc-300">
                Comments ({(messages.length)}{hasNextPage ? '+' : ''})
            </div>

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
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMutation.mutate(inputText))}
                        placeholder={!session ? "Log in to join the discussion" : "Type a message..."}
                        className="flex-1 bg-transparent text-sm focus:outline-none text-white placeholder-zinc-500 px-2"
                        disabled={sendMutation.isPending || !session}
                    />
                    <Button
                        onClick={() => sendMutation.mutate(inputText)}
                        disabled={!inputText.trim() || sendMutation.isPending || !session}
                        className="bg-accent-500 text-white hover:bg-accent-600 h-8 px-4 text-sm font-medium"
                        size="sm"
                    >
                        {sendMutation.isPending ? '...' : 'Send'}
                    </Button>
                </div>
            </div>

            <div ref={scrollContainerRef} className="max-h-[500px] min-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex flex-col px-2 pt-2">
                    {messages.length === 0 && !isLoading ? (
                        <div className="text-center text-zinc-500 py-8 text-sm">No messages yet. Be the first to say hi!</div>
                    ) : (
                        <Discussion type="multiple" className="space-y-4">
                            {rootMessages.map((msg) => {
                                const replies = repliesMap.get(msg.id) || [];
                                const name = formatDisplayName(msg.user, msg.userId);
                                const profile = msg.user.address || msg.userId;
                                const bet = msg.user.bets?.[0];

                                return (
                                    <DiscussionItem key={msg.id} value={msg.id}>
                                        <DiscussionContent className="gap-3 items-start">
                                            <UserHoverCard address={profile}>
                                                <Link href={`/profile?address=${profile}`}>
                                                    <Avatar className="w-7 h-7 border border-zinc-700 cursor-pointer">
                                                        <AvatarImage src={msg.user.avatarUrl || msg.user.image || generateAvatarDataUri(msg.user.address || msg.user.username || msg.userId, 120)} />
                                                        <AvatarFallback className="bg-gradient-to-br from-primary-500 to-accent-600 text-white font-bold text-xs">{(name[0] || 'U').toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                </Link>
                                            </UserHoverCard>

                                            <div className="flex flex-col gap-1 w-full min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <UserHoverCard address={profile}>
                                                        <Link href={`/profile?address=${profile}`}>
                                                            <DiscussionTitle className={`hover:underline text-sm font-semibold cursor-pointer ${msg.userId === session?.user?.id ? 'text-accent-400' : 'text-zinc-100'}`}>{name}</DiscussionTitle>
                                                        </Link>
                                                    </UserHoverCard>
                                                    <span className="text-[10px] text-zinc-500">{formatTime(msg.createdAt)}</span>
                                                    {bet && (
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${bet.option === 'YES' ? 'bg-secondary-500/10 text-secondary-400 border-secondary-500/40' : 'bg-error-500/10 text-error-400 border-error-500/40'}`}>
                                                            {bet.option} ${Number(bet.amount).toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                                <DiscussionBody className="text-sm text-zinc-300">{msg.text}</DiscussionBody>
                                                <div className="flex items-center pt-1 text-xs text-zinc-500 gap-4">
                                                    <button onClick={() => setReplyTo({ id: msg.id, username: name })} className="hover:text-white flex items-center gap-1"><ArrowUturnLeftIcon className="w-3 h-3" /> Reply</button>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => reactMutation.mutate({ messageId: msg.id, type: 'LIKE' })} className="hover:text-secondary-400 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {(msg.reactions?.LIKE?.length || 0) || ''}</button>
                                                        <button onClick={() => reactMutation.mutate({ messageId: msg.id, type: 'DISLIKE' })} className="hover:text-error-400 flex items-center gap-1"><ThumbsDown className="h-3 w-3" /> {(msg.reactions?.DISLIKE?.length || 0) || ''}</button>
                                                    </div>
                                                    {replies.length > 0 && <DiscussionExpand />}
                                                </div>
                                            </div>
                                        </DiscussionContent>
                                        {replies.length > 0 && (
                                            <DiscussionReplies>
                                                <div className="space-y-3 py-2 pl-3 border-l border-zinc-700/50 ml-3">
                                                    {replies.map(r => (
                                                        <div key={r.id} className="flex gap-2">
                                                            <UserHoverCard address={r.user.address || r.userId}>
                                                                <Avatar className="w-5 h-5 border border-zinc-700 shrink-0 cursor-pointer">
                                                                    <AvatarImage src={r.user.avatarUrl || r.user.image || generateAvatarDataUri(r.user.address || r.user.username || r.userId, 120)} />
                                                                    <AvatarFallback className="bg-zinc-700 text-white font-bold text-[9px]">{(formatDisplayName(r.user, r.userId)[0] || 'U').toUpperCase()}</AvatarFallback>
                                                                </Avatar>
                                                            </UserHoverCard>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <UserHoverCard address={r.user.address || r.userId}><span className={`text-xs font-bold cursor-pointer hover:underline ${r.userId === session?.user?.id ? 'text-accent-400' : 'text-zinc-300'}`}>{formatDisplayName(r.user, r.userId)}</span></UserHoverCard>
                                                                    <span className="text-[10px] text-zinc-600">{formatTime(r.createdAt)}</span>
                                                                </div>
                                                                <p className="text-sm text-zinc-400 mt-0.5">{r.text}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </DiscussionReplies>
                                        )}
                                    </DiscussionItem>
                                );
                            })}
                        </Discussion>
                    )}
                    <div ref={observerTarget} className="h-8 w-full flex justify-center items-center">
                        {(isFetchingNextPage || isLoading) && <Loader2 className="animate-spin h-5 w-5 text-accent-500" />}
                    </div>
                </div>
            </div>
        </div>
    );
}
