'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityList } from './ActivityList';
import { UserHoverCard } from './UserHoverCard';
import { motion, AnimatePresence } from 'framer-motion';

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
    const scrollRef = useRef<HTMLDivElement>(null);
    const [inputText, setInputText] = useState('');
    const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
    const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    // Mock user for dev
    const user = { id: 'dev-user', username: 'Dev User' };
    const isLoaded = true;
    const queryClient = useQueryClient();

    // Fetch messages
    const { data: messages = [] } = useQuery<Message[]>({
        queryKey: ['messages', eventId],
        queryFn: async () => {
            const res = await fetch(`/api/events/${eventId}/messages`);
            if (!res.ok) throw new Error('Failed to fetch messages');
            return res.json();
        },
    });

    // Real-time updates via WebSocket
    useEffect(() => {
        const { socket } = require('@/lib/socket');

        function onMessage(data: any) {
            // Simple strategy: Just refetch the list when a new message comes in
            queryClient.invalidateQueries({ queryKey: ['messages', eventId] });
        }

        socket.on(`chat-message-${eventId}`, onMessage);

        return () => {
            socket.off(`chat-message-${eventId}`, onMessage);
        };
    }, [eventId, queryClient]);

    // Filter root messages and create a map of children
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

    // Send message mutation
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
            queryClient.invalidateQueries({ queryKey: ['messages', eventId] });
        },
    });

    // Edit mutation
    const editMutation = useMutation({
        mutationFn: async ({ id, text }: { id: string; text: string }) => {
            await fetch(`/api/messages/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, userId: user?.id }),
            });
        },
        onSuccess: () => {
            setEditingMessageId(null);
            setEditText('');
            queryClient.invalidateQueries({ queryKey: ['messages', eventId] });
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await fetch(`/api/messages/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', eventId] });
        },
    });

    // Reaction mutation
    const reactMutation = useMutation({
        mutationFn: async ({ messageId, type }: { messageId: string; type: string }) => {
            await fetch(`/api/messages/${messageId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id, type }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', eventId] });
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

    const handleEditStart = (msg: Message) => {
        setEditingMessageId(msg.id);
        setEditText(msg.text);
    };

    const handleEditSave = (id: string) => {
        if (!editText.trim()) return;
        editMutation.mutate({ id, text: editText });
    };

    const handleEditCancel = () => {
        setEditingMessageId(null);
        setEditText('');
    };

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this message?')) {
            deleteMutation.mutate(id);
        }
    };

    const toggleThread = (messageId: string) => {
        const newExpanded = new Set(expandedThreads);
        if (newExpanded.has(messageId)) {
            newExpanded.delete(messageId);
        } else {
            newExpanded.add(messageId);
        }
        setExpandedThreads(newExpanded);
    };

    const handleCopyBet = (option: string) => {
        alert(`Copying trade: ${option}`);
    };

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current && !replyTo) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length, replyTo]);

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

    const [activeTab, setActiveTab] = useState<'chat' | 'activity'>('chat');

    const renderMessage = (msg: Message, isReply = false) => {
        const isMe = msg.userId === user?.id;
        const likes = msg.reactions?.['LIKE'] || [];
        const dislikes = msg.reactions?.['DISLIKE'] || [];
        const hasLiked = user?.id && likes.includes(user.id);
        const hasDisliked = user?.id && dislikes.includes(user.id);
        const isEditing = editingMessageId === msg.id;
        const replies = messageMap.get(msg.id) || [];
        const isExpanded = expandedThreads.has(msg.id);

        // Don't render deleted messages without replies at all
        if (msg.isDeleted && replies.length === 0) {
            return null;
        }

        return (
            <div key={msg.id} className={`${isReply ? 'ml-12 border-l-2 border-white/10 pl-3' : ''}`}>
                <div className={`group relative rounded-lg p-3 transition-colors ${isMe ? 'bg-[#3a3a3a]/50 border border-[#bb86fc]/20' : 'hover:bg-white/5'}`}>
                    <div className="flex gap-3">
                        <div className="shrink-0 pt-1">
                            <UserHoverCard address={msg.user.address || msg.userId}>
                                <div className="cursor-pointer">
                                    {msg.user.avatarUrl ? (
                                        <img src={msg.user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-white/10" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white border border-white/10 shadow-lg">
                                            {(msg.user.username?.[0] || (msg.user.address ? msg.user.address.slice(2, 3) : msg.userId.slice(0, 1))).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </UserHoverCard>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <UserHoverCard address={msg.user.address || msg.userId}>
                                    <span className={`text-sm font-bold cursor-pointer hover:underline ${isMe ? 'text-[#bb86fc]' : 'text-white'}`}>
                                        {msg.user.username || `${(msg.user.address || msg.userId).slice(0, 6)}...`}
                                    </span>
                                </UserHoverCard>
                                <span className="text-[10px] text-gray-500">{formatTime(msg.createdAt)}</span>
                                {msg.editedAt && (
                                    <span className="text-[9px] text-gray-600">(edited)</span>
                                )}

                                {/* Bet Badge & Copy Button */}
                                {msg.user.bets && msg.user.bets.length > 0 && (
                                    <div className="flex gap-1 ml-auto items-center">
                                        {msg.user.bets.slice(0, 1).map((bet, idx) => (
                                            <div key={idx} className="flex items-center gap-1 bg-[#1e1e1e] rounded px-1.5 py-0.5 border border-white/10">
                                                <span className={`text-[10px] font-bold ${bet.option === 'YES' ? 'text-[#03dac6]' : 'text-[#cf6679]'}`}>
                                                    {bet.option}
                                                </span>
                                                <button
                                                    onClick={() => handleCopyBet(bet.option)}
                                                    className="text-[9px] text-gray-400 hover:text-white uppercase tracking-wider border-l border-white/10 pl-1 ml-1"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Message Content */}
                            {msg.isDeleted ? (
                                <p className="text-sm text-gray-600 italic">*message deleted*</p>
                            ) : isEditing ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="w-full bg-[#2c2c2c] text-sm px-2 py-1 rounded border border-white/10 text-white"
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEditSave(msg.id)} className="text-xs bg-[#bb86fc] text-black px-3 py-1 rounded">
                                            Save
                                        </button>
                                        <button onClick={handleEditCancel} className="text-xs bg-white/10 text-white px-3 py-1 rounded">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-300 break-words leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            )}

                            {/* Actions Row */}
                            {!msg.isDeleted && (
                                <div className="flex items-center gap-4 mt-2">
                                    <button
                                        onClick={() => setReplyTo({ id: msg.id, username: msg.user.username || 'User' })}
                                        className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                        Reply
                                    </button>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => reactMutation.mutate({ messageId: msg.id, type: 'LIKE' })}
                                            className={`text-xs flex items-center gap-1 ${hasLiked ? 'text-[#bb86fc]' : 'text-gray-500 hover:text-[#bb86fc]'}`}
                                        >
                                            <svg className="w-3 h-3" fill={hasLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                                            {likes.length > 0 && likes.length}
                                        </button>
                                        <button
                                            onClick={() => reactMutation.mutate({ messageId: msg.id, type: 'DISLIKE' })}
                                            className={`text-xs flex items-center gap-1 ${hasDisliked ? 'text-[#cf6679]' : 'text-gray-500 hover:text-[#cf6679]'}`}
                                        >
                                            <svg className="w-3 h-3" fill={hasDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
                                            {dislikes.length > 0 && dislikes.length}
                                        </button>
                                    </div>

                                    {/* Edit/Delete for own messages */}
                                    {isMe && !isEditing && (
                                        <>
                                            <button
                                                onClick={() => handleEditStart(msg)}
                                                className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(msg.id)}
                                                className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                Delete
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Thread Toggle & Replies */}
                {replies.length > 0 && (
                    <div className="mt-1">
                        <button
                            onClick={() => toggleThread(msg.id)}
                            className="text-xs text-[#bb86fc] hover:text-[#a66ef1] flex items-center gap-1 ml-12"
                        >
                            <svg className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {isExpanded ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                        </button>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="mt-1 space-y-2 overflow-hidden"
                                >
                                    {replies.map(reply => renderMessage(reply, true))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="material-card p-4 flex flex-col h-full min-h-[600px]">
            {/* Tabs Header */}
            <div className="flex items-center gap-6 mb-4 border-b border-white/10 pb-2">
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`text-sm font-medium pb-2 relative transition-colors ${activeTab === 'chat' ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    Comments ({rootMessages.length})
                    {activeTab === 'chat' && (
                        <span className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-[#bb86fc] rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`text-sm font-medium pb-2 relative transition-colors ${activeTab === 'activity' ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    Activity
                    {activeTab === 'activity' && (
                        <span className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-[#03dac6] rounded-t-full" />
                    )}
                </button>
            </div>

            {activeTab === 'chat' ? (
                <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2 custom-scrollbar">
                        {rootMessages.length === 0 ? (
                            <div className="text-center text-gray-500 py-10 text-sm">No messages yet. Be the first to say hi!</div>
                        ) : (
                            rootMessages.map(msg => renderMessage(msg))
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="relative">
                        {replyTo && (
                            <div className="flex items-center justify-between bg-[#2c2c2c] px-3 py-1.5 rounded-t-lg border-b border-white/5 text-xs text-gray-400">
                                <span>Replying to <span className="text-[#bb86fc]">@{replyTo.username}</span></span>
                                <button onClick={() => setReplyTo(null)} className="hover:text-white">&times;</button>
                            </div>
                        )}
                        <div className={`flex gap-2 bg-[#1e1e1e] p-2 rounded-lg border border-white/10 ${replyTo ? 'rounded-t-none' : ''}`}>
                            {user && isLoaded ? (
                                <>
                                    <input
                                        type="text"
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={replyTo ? "Write a reply..." : "Type a message..."}
                                        className="flex-1 bg-transparent text-sm focus:outline-none text-white placeholder-gray-600 px-2"
                                        disabled={sendMessageMutation.isPending}

                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!inputText.trim() || sendMessageMutation.isPending}
                                        className="bg-[#bb86fc] hover:bg-[#a66ef1] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-4 py-1.5 rounded text-sm transition-colors"
                                    >
                                        {sendMessageMutation.isPending ? '...' : 'Send'}
                                    </button>
                                </>
                            ) : (
                                <div className="w-full text-center py-1 text-sm text-gray-500">Sign in to chat</div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <ActivityList eventId={eventId} />
            )}
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
            `}</style>
        </div>
    );
}
