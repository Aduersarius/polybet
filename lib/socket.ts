import Pusher from 'pusher-js';

// Get configuration from env with defaults
const PUSHER_KEY = process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key';
const PUSHER_HOST = process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.pariflow.com';
const PUSHER_PORT = parseInt(process.env.NEXT_PUBLIC_SOKETI_PORT || '443');
const USE_TLS = process.env.NEXT_PUBLIC_SOKETI_USE_TLS !== 'false';

/**
 * Soketi / Pusher Client Instance
 * Replacing the old Socket.io setup for a "bulletproof" real-time experience.
 */
export const socket = new Pusher(PUSHER_KEY, {
    wsHost: PUSHER_HOST,
    wsPort: PUSHER_PORT,
    wssPort: PUSHER_PORT,
    forceTLS: USE_TLS,
    enabledTransports: ['ws', 'wss'],
    disableStats: true,
    cluster: 'mt1',
});

// Log connection status in development
if (process.env.NODE_ENV === 'development') {
    socket.connection.bind('connected', () => {
        console.log('[Pusher] ✅ Connected');
    });

    socket.connection.bind('error', (err: any) => {
        console.error('[Pusher] ❌ Connection error:', err?.error?.data || err);
    });
}

// For backward compatibility and easier export usage
export default socket;
