import { io } from 'socket.io-client';

// Always use VPS WebSocket endpoint (both dev and prod)
const VPS_URL = 'https://ws.pariflow.com';

export const socket = io(VPS_URL, {
    autoConnect: true,
    reconnection: true,
});
