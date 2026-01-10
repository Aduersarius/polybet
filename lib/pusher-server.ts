import Pusher from 'pusher';

let pusher: Pusher | null = null;

export function getPusherServer() {
    if (!pusher) {
        pusher = new Pusher({
            appId: process.env.SOKETI_DEFAULT_APP_ID || 'pariflow',
            key: process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key',
            secret: process.env.SOKETI_DEFAULT_APP_SECRET || 'pariflow_secret',
            host: process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.polybet.ru',
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
        console.error(`[Pusher] Error triggering user update for ${userId}:`, error);
    }
}
