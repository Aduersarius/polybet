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

interface Notification {
    id: string;
    type: 'REPLY' | 'MENTION' | 'BET_RESULT' | 'FAVORITE_UPDATE' | 'SUPPORT_REPLY' | 'DEPOSIT_SUCCESS';
    message: string;
    resourceId: string | null;
    isRead: boolean;
    createdAt: string;
}

export function NotificationBell() {
    const { data: session, isPending } = useSession();
    const [isOpen, setIsOpen] = useState(false);
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
            } else {
                window.location.href = `/event/${notification.resourceId}`;
            }
        }
        setIsOpen(false);
    };

    // When the dropdown is opened, mark all unread notifications as read
    useEffect(() => {
        if (!isOpen) return;
        if (!notifications.length) return;

        const unread = notifications.filter((n) => !n.isRead);
        unread.forEach((n) => {
            if (!markReadMutation.isPending) {
                markReadMutation.mutate(n.id);
            }
        });
    }, [isOpen, notifications, markReadMutation]);

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
                        className="absolute right-0 mt-2 w-80 bg-[var(--surface-elevated)] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="p-3.5 bg-gradient-to-r from-[var(--primary)]/10 to-[var(--accent)]/10 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="text-xs font-medium text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>

                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-800/50 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-400 text-sm">No notifications yet</p>
                                </div>
                            ) : (
                                notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`p-3.5 border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors ${!notification.isRead ? 'bg-[var(--accent)]/5' : ''
                                            }`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-1.5">
                                                {notification.type === 'REPLY' && (
                                                    <div className="w-2 h-2 rounded-full bg-[var(--secondary)]" />
                                                )}
                                                {notification.type === 'MENTION' && (
                                                    <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                                                )}
                                                {notification.type === 'BET_RESULT' && (
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                )}
                                                {notification.type === 'SUPPORT_REPLY' && (
                                                    <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                                                )}
                                                {notification.type === 'FAVORITE_UPDATE' && (
                                                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                )}
                                                {notification.type === 'DEPOSIT_SUCCESS' && (
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!notification.isRead ? 'text-white font-medium' : 'text-gray-400'}`}>
                                                    {notification.message}
                                                </p>
                                                <span className="text-[10px] text-gray-500 block mt-1">
                                                    {new Date(notification.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
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
