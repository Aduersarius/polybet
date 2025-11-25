'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

interface Notification {
    id: string;
    type: 'REPLY' | 'MENTION' | 'BET_RESULT' | 'FAVORITE_UPDATE';
    message: string;
    resourceId: string | null;
    isRead: boolean;
    createdAt: string;
}

export function NotificationBell() {
    // Mock user for dev
    const user = { id: 'dev-user' };
    const isLoaded = true;
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const { data } = useQuery<{ notifications: Notification[], unreadCount: number }>({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user?.id) return { notifications: [], unreadCount: 0 };
            const res = await fetch(`/api/notifications?userId=${user.id}`);
            if (!res.ok) throw new Error('Failed to fetch notifications');
            return res.json();
        },
        enabled: !!user?.id && isLoaded,
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
            queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
        },
    });

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            markReadMutation.mutate(notification.id);
        }

        if (notification.resourceId) {
            // Navigate to resource (simplified)
            window.location.href = `/event/${notification.resourceId}`;
        }
        setIsOpen(false);
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

    if (!user || !isLoaded) return null;

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
                        className="absolute right-0 mt-2 w-80 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50"
                    >
                        <div className="p-3 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="text-xs text-[#bb86fc]">{unreadCount} new</span>
                            )}
                        </div>

                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    No notifications yet
                                </div>
                            ) : (
                                notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${!notification.isRead ? 'bg-[#bb86fc]/5' : ''}`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-1">
                                                {notification.type === 'REPLY' && (
                                                    <div className="w-2 h-2 rounded-full bg-[#03dac6]" />
                                                )}
                                                {notification.type === 'MENTION' && (
                                                    <div className="w-2 h-2 rounded-full bg-[#bb86fc]" />
                                                )}
                                                {notification.type === 'BET_RESULT' && (
                                                    <div className="w-2 h-2 rounded-full bg-[#cf6679]" />
                                                )}
                                            </div>
                                            <div>
                                                <p className={`text-sm ${!notification.isRead ? 'text-white font-medium' : 'text-gray-400'}`}>
                                                    {notification.message}
                                                </p>
                                                <span className="text-[10px] text-gray-600 block mt-1">
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
