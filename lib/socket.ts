import { io } from 'socket.io-client';

// Replace with your SSL-enabled WebSocket subdomain
const VPS_URL = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001'
    : 'https://ws.polybet.ru';

export const socket = io(VPS_URL, {
    autoConnect: true,
    reconnection: true,
});
