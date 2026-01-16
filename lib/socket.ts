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
// Enable verbose logging in development
if (process.env.NODE_ENV === 'development') {
    Pusher.logToConsole = true;
}

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
    console.log('[Pusher] Initializing with config:', {
        wsHost: PUSHER_HOST,
        wsPort: PUSHER_PORT,
        forceTLS: USE_TLS,
    });

    socket.connection.bind('connected', () => {
        console.log('[Pusher] ✅ Connected to Soketi');
    });

    socket.connection.bind('error', (err: any) => {
        // Detailed error logging to debug "Connection error: {}"
        console.error('[Pusher] ❌ Connection error object:', err);
        if (err?.error?.data) {
            console.error('[Pusher] ❌ Error detail:', err.error.data);
        }
    });

    socket.connection.bind('state_change', (states: any) => {
        console.log('[Pusher] 🔄 State change:', states.previous, '->', states.current);
    });

    socket.connection.bind('failed', () => {
        console.error('[Pusher] ❌ Connection failed');
    });
}

// For backward compatibility and easier export usage
export default socket;
