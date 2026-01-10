'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '@/lib/socket';

export function useAdminWebSocket() {
    const queryClient = useQueryClient();

    useEffect(() => {
        const channel = socket.subscribe('admin-events');

        const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
        const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        const invalidateStats = () => queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });

        // Listen for admin-specific events
        channel.bind('admin:event-created', invalidateEvents);
        channel.bind('admin:event-updated', invalidateEvents);
        channel.bind('admin:event-resolved', invalidateEvents);
        channel.bind('admin:user-created', invalidateUsers);
        channel.bind('admin:user-updated', invalidateUsers);
        channel.bind('admin:user-deleted', invalidateUsers);
        channel.bind('admin:bet-placed', () => {
            invalidateEvents();
            invalidateStats();
        });
        channel.bind('admin:stats-updated', invalidateStats);

        // Cleanup on unmount
        return () => {
            channel.unbind('admin:event-created', invalidateEvents);
            channel.unbind('admin:event-updated', invalidateEvents);
            channel.unbind('admin:event-resolved', invalidateEvents);
            channel.unbind('admin:user-created', invalidateUsers);
            channel.unbind('admin:user-updated', invalidateUsers);
            channel.unbind('admin:user-deleted', invalidateUsers);
            channel.unbind('admin:bet-placed');
            channel.unbind('admin:stats-updated', invalidateStats);
            socket.unsubscribe('admin-events');
        };
    }, [queryClient]);
}
