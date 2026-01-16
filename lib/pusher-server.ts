import Pusher from 'pusher';

let pusher: Pusher | null = null;

export function getPusherServer() {
    if (!pusher) {
        const appId = process.env.SOKETI_DEFAULT_APP_ID || process.env.NEXT_PUBLIC_SOKETI_APP_ID || 'pariflow';
        const key = process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key';
        const secret = process.env.SOKETI_DEFAULT_APP_SECRET || 'pariflow_secret';
        const host = process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.pariflow.com';

        console.log('[Pusher Server] Initializing with credentials:', {
            appId: appId?.substring(0, 8) + '...',
            key: key?.substring(0, 12) + '...',
            secret: secret?.substring(0, 12) + '...',
            host,
        });

        pusher = new Pusher({
            appId,
            key,
            secret,
            host,
            port: process.env.NEXT_PUBLIC_SOKETI_PORT || '443',
            useTLS: process.env.NEXT_PUBLIC_SOKETI_USE_TLS !== 'false',
        });
    }
    return pusher;
}

export async function triggerUserUpdate(userId: string, type: string, payload: any) {
    const pusher = getPusherServer();
    try {
        await pusher.trigger(`user-${userId}`, type, payload);
    } catch (error) {
        console.error('[Pusher] Error triggering user update for %s:', userId, error);
    }
}
