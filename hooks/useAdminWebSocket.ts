'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '@/lib/socket';

export function useAdminWebSocket() {
    const queryClient = useQueryClient();

    useEffect(() => {
        // Connect socket
        socket.connect();

        // Listen for admin-specific events
        socket.on('admin:event-created', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
        });

        socket.on('admin:event-updated', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
        });

        socket.on('admin:event-resolved', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
        });

        socket.on('admin:user-created', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        });

        socket.on('admin:user-updated', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        });

        socket.on('admin:user-deleted', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        });

        socket.on('admin:bet-placed', () => {
            // Refresh both events (for bet count) and statistics
            queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });
        });

        socket.on('admin:stats-updated', () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });
        });

        // Cleanup on unmount
        return () => {
            socket.off('admin:event-created');
            socket.off('admin:event-updated');
            socket.off('admin:event-resolved');
            socket.off('admin:user-created');
            socket.off('admin:user-updated');
            socket.off('admin:user-deleted');
            socket.off('admin:bet-placed');
            socket.off('admin:stats-updated');
        };
    }, [queryClient]);
}
