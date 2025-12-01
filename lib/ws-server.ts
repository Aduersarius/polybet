import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { prisma } from './prisma';

export interface WSServerConfig {
    port?: number;
    corsOrigin?: string;
}

class TradingWebSocketServer {
    private io: Server;
    private httpServer: any;

    constructor(config: WSServerConfig = {}) {
        const port = config.port || 3001;
        const corsOrigin = config.corsOrigin || "*";

        // Create HTTP server for Socket.IO
        this.httpServer = createServer();
        
        // Initialize Socket.IO server
        this.io = new Server(this.httpServer, {
            cors: {
                origin: corsOrigin,
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });

        this.setupEventHandlers();
        this.httpServer.listen(port, () => {
            console.log(`🚀 WebSocket server running on port ${port}`);
        });
    }

    private setupEventHandlers() {
        this.io.on('connection', (socket: Socket) => {
            console.log(`📡 Client connected: ${socket.id}`);

            // Handle joining event rooms for real-time updates
            socket.on('join-event', (eventId: string) => {
                socket.join(`event-${eventId}`);
                console.log(`📊 Client ${socket.id} joined event ${eventId}`);
            });

            socket.on('leave-event', (eventId: string) => {
                socket.leave(`event-${eventId}`);
                console.log(`📊 Client ${socket.id} left event ${eventId}`);
            });

            // Handle joining order book updates
            socket.on('subscribe-orderbook', (data: { eventId: string; option: 'YES' | 'NO' }) => {
                const room = `orderbook-${data.eventId}-${data.option}`;
                socket.join(room);
                console.log(`📈 Client ${socket.id} subscribed to orderbook ${room}`);
            });

            socket.on('unsubscribe-orderbook', (data: { eventId: string; option: 'YES' | 'NO' }) => {
                const room = `orderbook-${data.eventId}-${data.option}`;
                socket.leave(room);
                console.log(`📈 Client ${socket.id} unsubscribed from orderbook ${room}`);
            });

            // Handle user portfolio updates
            socket.on('subscribe-portfolio', (userId: string) => {
                socket.join(`portfolio-${userId}`);
                console.log(`💼 Client ${socket.id} subscribed to portfolio ${userId}`);
            });

            socket.on('unsubscribe-portfolio', (userId: string) => {
                socket.leave(`portfolio-${userId}`);
                console.log(`💼 Client ${socket.id} unsubscribed from portfolio ${userId}`);
            });

            socket.on('disconnect', () => {
                console.log(`📡 Client disconnected: ${socket.id}`);
            });
        });

        // Set up database change listeners (you can implement these based on your needs)
        this.setupDatabaseListeners();
    }

    private setupDatabaseListeners() {
        // You can implement database change listeners here
        // For example, using Prisma events or database triggers
        // This is a placeholder for real-time data synchronization
    }

    // Broadcast trade updates to event rooms
    public broadcastTradeUpdate(eventId: string, tradeData: any) {
        const room = `event-${eventId}`;
        this.io.to(room).emit('trade-update', {
            eventId,
            ...tradeData,
            timestamp: Date.now()
        });
        console.log(`📡 Broadcasted trade update to room ${room}`);
    }

    // Broadcast order book updates
    public broadcastOrderbookUpdate(eventId: string, option: 'YES' | 'NO', orderbookData: any) {
        const room = `orderbook-${eventId}-${option}`;
        this.io.to(room).emit('orderbook-update', {
            eventId,
            option,
            ...orderbookData,
            timestamp: Date.now()
        });
        console.log(`📈 Broadcasted orderbook update to room ${room}`);
    }

    // Broadcast odds updates (for AMM changes)
    public broadcastOddsUpdate(eventId: string, oddsData: any) {
        const room = `event-${eventId}`;
        this.io.to(room).emit('odds-update', {
            eventId,
            ...oddsData,
            timestamp: Date.now()
        });
        console.log(`📊 Broadcasted odds update to room ${room}`);
    }

    // Broadcast portfolio updates
    public broadcastPortfolioUpdate(userId: string, portfolioData: any) {
        const room = `portfolio-${userId}`;
        this.io.to(room).emit('portfolio-update', {
            userId,
            ...portfolioData,
            timestamp: Date.now()
        });
        console.log(`💼 Broadcasted portfolio update to room ${room}`);
    }

    // Broadcast system-wide notifications
    public broadcastNotification(notification: any) {
        this.io.emit('notification', {
            ...notification,
            timestamp: Date.now()
        });
        console.log(`🔔 Broadcasted system notification`);
    }

    // Get connected clients count
    public getConnectedClientsCount(): number {
        return this.io.sockets.sockets.size;
    }

    // Get clients in a specific room
    public getRoomClients(room: string): number {
        return this.io.sockets.adapter.rooms.get(room)?.size || 0;
    }

    // Graceful shutdown
    public shutdown() {
        this.io.close();
        this.httpServer.close();
        console.log('🛑 WebSocket server shut down');
    }
}

// Singleton instance
let wsServerInstance: TradingWebSocketServer | null = null;

export function getWebSocketServer(config?: WSServerConfig): TradingWebSocketServer {
    if (!wsServerInstance) {
        wsServerInstance = new TradingWebSocketServer(config);
    }
    return wsServerInstance;
}

// Export for use in other modules
export { TradingWebSocketServer };