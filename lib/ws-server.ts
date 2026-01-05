import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { prisma } from './prisma';
import { redis } from './redis';
import { getOrderBook } from './hybrid-trading';
import { trustedOrigins } from './auth';

export interface WSServerConfig {
    port?: number;
    corsOrigin?: string | string[];
}

class TradingWebSocketServer {
    private io: Server;
    private httpServer: any;

    constructor(config: WSServerConfig = {}) {
        const port = config.port || 3001;

        // Use provided corsOrigin or fall back to trustedOrigins from auth config
        const allowedOrigins = config.corsOrigin
            ? (Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin])
            : trustedOrigins;

        // Create HTTP server for Socket.IO
        this.httpServer = createServer();

        const isProduction = process.env.NODE_ENV === 'production';

        // Initialize Socket.IO server
        this.io = new Server(this.httpServer, {
            cors: {
                origin: (origin, callback) => {
                    // In production, require origin
                    if (!origin) {
                        if (isProduction) {
                            callback(new Error('Origin required in production'));
                            return;
                        }
                        // Allow in development for local tools
                        callback(null, true);
                        return;
                    }

                    if (allowedOrigins.includes(origin)) {
                        callback(null, true);
                    } else {
                        callback(new Error('Not allowed by CORS'));
                    }
                },
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
        // Authentication middleware for WebSocket connections
        this.io.use(async (socket, next) => {
            try {
                // Extract cookies from handshake
                const cookies = socket.handshake.headers.cookie;

                if (!cookies) {
                    // Allow connection but mark as unauthenticated
                    // Public events (odds, chat) don't require auth
                    socket.data.authenticated = false;
                    next();
                    return;
                }

                // Verify session by checking with auth API
                // For now, we'll allow connection and verify per-event
                // In production, you'd verify the session token here
                socket.data.authenticated = true;
                socket.data.cookies = cookies;
                next();
            } catch (error) {
                // Allow connection but mark as unauthenticated
                socket.data.authenticated = false;
                next();
            }
        });

        this.io.on('connection', (socket: Socket) => {
            console.log(`📡 Client connected: ${socket.id} (authenticated: ${socket.data.authenticated || false})`);

            // Handle joining event rooms for real-time updates (public, no auth needed)
            socket.on('join-event', (eventId: string) => {
                socket.join(`event-${eventId}`);
                console.log(`📊 Client ${socket.id} joined event ${eventId}`);
            });

            socket.on('leave-event', (eventId: string) => {
                socket.leave(`event-${eventId}`);
                console.log(`📊 Client ${socket.id} left event ${eventId}`);
            });

            // Handle joining order book updates
            socket.on('subscribe-orderbook', (data: { eventId: string; option?: 'YES' | 'NO'; outcomeId?: string }) => {
                let room: string;
                if (data.outcomeId) {
                    // Multiple outcome event
                    room = `orderbook-${data.eventId}-${data.outcomeId}`;
                } else {
                    // Binary event
                    room = `orderbook-${data.eventId}-${data.option}`;
                }
                socket.join(room);
                console.log(`📈 Client ${socket.id} subscribed to orderbook ${room}`);
            });

            socket.on('unsubscribe-orderbook', (data: { eventId: string; option?: 'YES' | 'NO'; outcomeId?: string }) => {
                let room: string;
                if (data.outcomeId) {
                    // Multiple outcome event
                    room = `orderbook-${data.eventId}-${data.outcomeId}`;
                } else {
                    // Binary event
                    room = `orderbook-${data.eventId}-${data.option}`;
                }
                socket.leave(room);
                console.log(`📈 Client ${socket.id} unsubscribed from orderbook ${room}`);
            });

            // Handle user portfolio updates (requires authentication)
            socket.on('subscribe-portfolio', async (userId: string) => {
                if (!userId) {
                    socket.emit('error', { message: 'User ID required' });
                    return;
                }

                // Verify authentication for user-specific data
                if (!socket.data.authenticated) {
                    socket.emit('error', { message: 'Authentication required for portfolio access' });
                    return;
                }

                socket.join(`portfolio-${userId}`);
                console.log(`💼 Client ${socket.id} subscribed to portfolio ${userId}`);
            });

            socket.on('unsubscribe-portfolio', (userId: string) => {
                socket.leave(`portfolio-${userId}`);
                console.log(`💼 Client ${socket.id} unsubscribed from portfolio ${userId}`);
            });

            // Handle transaction updates (requires authentication)
            socket.on('subscribe-transactions', async (userId: string) => {
                if (!userId) return;
                socket.join(`transactions-${userId}`);
                console.log(`💸 Client ${socket.id} subscribed to transactions ${userId}`);
            });

            socket.on('unsubscribe-transactions', (userId: string) => {
                if (!userId) return;
                socket.leave(`transactions-${userId}`);
                console.log(`💸 Client ${socket.id} unsubscribed from transactions ${userId}`);
            });

            socket.on('disconnect', () => {
                console.log(`📡 Client disconnected: ${socket.id}`);
            });
        });

        // Set up database change listeners (you can implement these based on your needs)
        this.setupDatabaseListeners();
    }

    private setupDatabaseListeners() {
        // Subscribe to Redis channels for real-time updates
        if (redis) {
            // Subscribe to multiple channels
            const channels = ['hybrid-trades', 'user-updates'];

            channels.forEach(channel => {
                redis.subscribe(channel, (err, count) => {
                    if (err) {
                        console.error(`❌ Failed to subscribe to Redis channel ${channel}:`, err);
                        return;
                    }
                    console.log(`📡 Subscribed to Redis channel: ${channel}`);
                });
            });

            // Handle incoming Redis messages
            redis.on('message', async (channel, message) => {
                try {
                    const data = JSON.parse(message);

                    if (channel === 'hybrid-trades') {
                        // Broadcast trade updates to event rooms
                        this.broadcastOddsUpdate(data.eventId, data);

                        // Also broadcast order book updates if applicable
                        if (data.outcomeId) {
                            // For multiple outcomes, broadcast to the specific outcome order book
                            try {
                                const orderBook = await getOrderBook(data.eventId, data.outcomeId);
                                this.broadcastOrderbookUpdate(data.eventId, data.outcomeId, orderBook);
                            } catch (err) {
                                console.error(`❌ Failed to fetch orderbook for ${data.eventId}/${data.outcomeId}:`, err);
                            }
                        } else if (data.option) {
                            // For binary events
                            try {
                                const orderBook = await getOrderBook(data.eventId, data.option);
                                this.broadcastOrderbookUpdate(data.eventId, data.option, orderBook);
                            } catch (err) {
                                console.error(`❌ Failed to fetch orderbook for ${data.eventId}/${data.option}:`, err);
                            }
                        }
                    } else if (channel === 'user-updates') {
                        // Handle user-specific updates (transactions, notifications)
                        if (data.type === 'transaction') {
                            this.broadcastTransactionUpdate(data.userId, data.payload);
                        } else if (data.type === 'notification') {
                            this.broadcastNotification(data.payload);
                        }
                    }
                } catch (error) {
                    console.error('❌ Error processing Redis message:', error);
                }
            });
        }
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
    public broadcastOrderbookUpdate(eventId: string, optionOrOutcomeId: string, orderbookData: any) {
        const room = `orderbook-${eventId}-${optionOrOutcomeId}`;
        this.io.to(room).emit('orderbook-update', {
            eventId,
            option: optionOrOutcomeId, // Could be 'YES'/'NO' or outcomeId
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

    // Broadcast transaction updates
    public broadcastTransactionUpdate(userId: string, transactionData: any) {
        const room = `transactions-${userId}`;
        this.io.to(room).emit('transaction-update', {
            userId,
            ...transactionData,
            timestamp: Date.now()
        });
        console.log(`💸 Broadcasted transaction update to room ${room}`);
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