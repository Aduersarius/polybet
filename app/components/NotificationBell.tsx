'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { createAuthClient } from "better-auth/react";
import { useSupportChat } from '@/contexts/SupportChatContext';

const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
});

const { useSession } = authClient;

interface NotificationMetadata {
    eventTitle?: string;
    imageUrl?: string | null;
    side?: string;
    amount?: number;
    price?: number;
    outcome?: string;
    outcomeId?: string;
    currency?: string;
    netAmount?: number;
    fee?: number;
    txHash?: string;
}

interface Notification {
    id: string;
    type: 'REPLY' | 'MENTION' | 'BET_RESULT' | 'FAVORITE_UPDATE' | 'SUPPORT_REPLY' | 'DEPOSIT_SUCCESS';
    message: string;
    resourceId: string | null;
    resourceSlug?: string | null;
    isRead: boolean;
    createdAt: string;
    metadata?: NotificationMetadata;
}

type TabType = 'unread' | 'history';

function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function NotificationIcon({ type, imageUrl }: { type: string; imageUrl?: string | null }) {
    const baseClasses = "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden";

    // If we have an image URL for trade notifications, show the event image
    if (type === 'BET_RESULT' && imageUrl) {
        return (
            <div className={`${baseClasses} bg-gray-800`}>
                <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>
        );
    }

    switch (type) {
        case 'BET_RESULT':
            return (
                <div className={`${baseClasses} bg-amber-500/20`}>
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </div>
            );
        case 'DEPOSIT_SUCCESS':
            return (
                <div className={`${baseClasses} bg-emerald-500/20`}>
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </div>
            );
        case 'SUPPORT_REPLY':
            return (
                <div className={`${baseClasses} bg-blue-500/20`}>
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                </div>
            );
        case 'FAVORITE_UPDATE':
            return (
                <div className={`${baseClasses} bg-rose-500/20`}>
                    <svg className="w-4 h-4 text-rose-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                </div>
            );
        default:
            return (
                <div className={`${baseClasses} bg-gray-500/20`}>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </div>
            );
    }
}

function NotificationContent({ notification }: { notification: Notification }) {
    const meta = notification.metadata;

    // Trade notification with rich metadata
    if (notification.type === 'BET_RESULT' && meta?.eventTitle) {
        const isBuy = meta.side === 'buy';
        return (
            <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 font-medium truncate mb-1" title={meta.eventTitle}>
                    {meta.eventTitle}
                </p>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {meta.side?.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-300">
                        {meta.outcome}
                    </span>
                    <span className="text-xs text-gray-500">
                        ${meta.amount?.toFixed(2)} @ {((meta.price || 0) * 100).toFixed(0)}¢
                    </span>
                </div>
                <span className="text-[10px] text-gray-600 block mt-1">
                    {formatRelativeTime(notification.createdAt)}
                </span>
            </div>
        );
    }

    // Trade notification without metadata - parse from message
    if (notification.type === 'BET_RESULT') {
        // Parse "Trade executed: BUY 11 YES" or similar
        const match = notification.message.match(/Trade executed:\s*(BUY|SELL)\s+(\d+(?:\.\d+)?)\s+(.+)/i);
        if (match) {
            const [, side, amount, outcome] = match;
            const isBuy = side.toUpperCase() === 'BUY';
            return (
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/90 font-medium mb-1">
                        Trade Executed
                    </p>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {side.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-300">
                            {outcome}
                        </span>
                        <span className="text-xs text-gray-500">
                            ${parseFloat(amount).toFixed(2)}
                        </span>
                    </div>
                    <span className="text-[10px] text-gray-600 block mt-1">
                        {formatRelativeTime(notification.createdAt)}
                    </span>
                </div>
            );
        }
    }

    // Deposit notification with rich details
    if (notification.type === 'DEPOSIT_SUCCESS' && meta?.amount) {
        return (
            <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 font-medium">
                    Deposit Confirmed
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-emerald-400 font-semibold text-sm">
                        +${meta.amount?.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500">
                        {meta.currency || 'USDC'}
                    </span>
                    {meta.fee && meta.fee > 0 && (
                        <span className="text-xs text-gray-600">
                            (fee: ${meta.fee?.toFixed(2)})
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-gray-600 block mt-1">
                    {formatRelativeTime(notification.createdAt)}
                </span>
            </div>
        );
    }

    // Default fallback
    return (
        <div className="flex-1 min-w-0">
            <p className={`text-sm ${!notification.isRead ? 'text-white font-medium' : 'text-gray-400'}`}>
                {notification.message}
            </p>
            <span className="text-[10px] text-gray-600 block mt-1">
                {formatRelativeTime(notification.createdAt)}
            </span>
        </div>
    );
}

export function NotificationBell() {
    const { data: session, isPending } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('unread');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();
    const { openChat } = useSupportChat();

    const { data } = useQuery<{ notifications: Notification[], unreadCount: number }>({
        queryKey: ['notifications', (session as any)?.user?.id],
        queryFn: async () => {
            if (!(session as any)?.user?.id) return { notifications: [], unreadCount: 0 };
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('Failed to fetch notifications');
            return res.json();
        },
        enabled: !!(session as any)?.user?.id && !isPending,
        refetchInterval: 10000, // Poll every 10s
    });

    const notifications = data?.notifications || [];
    const unreadCount = data?.unreadCount || 0;

    const unreadNotifications = notifications.filter(n => !n.isRead);
    const readNotifications = notifications.filter(n => n.isRead);
    const displayedNotifications = activeTab === 'unread' ? unreadNotifications : readNotifications;

    const markReadMutation = useMutation({
        mutationFn: async (notificationId: string) => {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', (session as any)?.user?.id] });
        },
    });

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            markReadMutation.mutate(notification.id);
        }

        if (notification.resourceId) {
            // Navigate to resource - support tickets open support chat, events go to event page
            if (notification.type === 'SUPPORT_REPLY') {
                // Open support chat widget with the ticket
                openChat();
                // Dispatch event for SupportChatWidget to handle ticket selection
                window.dispatchEvent(new CustomEvent('open-support-chat', { detail: { ticketId: notification.resourceId } }));
            } else if (notification.type !== 'DEPOSIT_SUCCESS') {
                window.location.href = `/event/${notification.resourceSlug || notification.resourceId}`;
            }
        }
        setIsOpen(false);
    };

    const markAllAsRead = () => {
        unreadNotifications.forEach((n) => {
            if (!markReadMutation.isPending) {
                markReadMutation.mutate(n.id);
            }
        });
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white transition-colors"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border border-[#121212]">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 mt-2 w-96 bg-[var(--surface-elevated)] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                    >
                        {/* Header with Tabs */}
                        <div className="border-b border-white/5">
                            <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-white">Notifications</h3>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors"
                                    >
                                        Mark all read
                                    </button>
                                )}
                            </div>

                            {/* Tabs */}
                            <div className="flex px-4 gap-1">
                                <button
                                    onClick={() => setActiveTab('unread')}
                                    className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors relative ${activeTab === 'unread'
                                        ? 'text-white bg-white/5'
                                        : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    Unread
                                    {unreadCount > 0 && (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--accent)]/20 text-[var(--accent)] rounded-full">
                                            {unreadCount}
                                        </span>
                                    )}
                                    {activeTab === 'unread' && (
                                        <motion.div
                                            layoutId="tab-indicator"
                                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]"
                                        />
                                    )}
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors relative ${activeTab === 'history'
                                        ? 'text-white bg-white/5'
                                        : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    History
                                    {activeTab === 'history' && (
                                        <motion.div
                                            layoutId="tab-indicator"
                                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]"
                                        />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                            {displayedNotifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-800/50 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-400 text-sm">
                                        {activeTab === 'unread' ? 'All caught up!' : 'No notification history'}
                                    </p>
                                    {activeTab === 'unread' && readNotifications.length > 0 && (
                                        <button
                                            onClick={() => setActiveTab('history')}
                                            className="text-xs text-[var(--accent)] mt-2 hover:underline"
                                        >
                                            View history →
                                        </button>
                                    )}
                                </div>
                            ) : (
                                displayedNotifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`p-3.5 border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors ${!notification.isRead ? 'bg-[var(--accent)]/5' : ''
                                            }`}
                                    >
                                        <div className="flex gap-3">
                                            <NotificationIcon type={notification.type} imageUrl={notification.metadata?.imageUrl} />
                                            <NotificationContent notification={notification} />
                                            {!notification.isRead && (
                                                <div className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 mt-2" />
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
