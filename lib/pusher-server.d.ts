import Pusher from 'pusher';
export declare function getPusherServer(): Pusher;
export declare function triggerUserUpdate(userId: string, type: string, payload: any): Promise<void>;
