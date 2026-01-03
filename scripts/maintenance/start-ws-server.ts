import { getWebSocketServer } from '../../lib/ws-server';

console.log('Starting WebSocket Server from lib/ws-server.ts...');
try {
    const server = getWebSocketServer({ port: 3001 });
    console.log('WebSocket Server instance created.');
} catch (error) {
    console.error('Failed to start WebSocket Server:', error);
    process.exit(1);
}

// Keep process alive
process.on('SIGINT', () => {
    console.log('Stopping WebSocket Server...');
    process.exit(0);
});
