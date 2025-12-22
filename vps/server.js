require('dotenv').config();
const { Server } = require('socket.io');
const Redis = require('ioredis');

// 1. Setup Redis Subscriber (Listens to Next.js Backend)
// If your Redis is on the same VPS, 'redis://localhost:6379' is fine.
// If you set a password (RECOMMENDED), use 'redis://:password@localhost:6379'
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// 2. Setup Socket.IO Server (Talks to Frontend Users)
// Get allowed origins from environment or use defaults
const allowedOrigins = process.env.WEBSOCKET_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [
    'https://polybet.ru',
    'https://www.polybet.ru',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])
];

const io = new Server(3001, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests) in development only
            if (!origin) {
                if (process.env.NODE_ENV === 'production') {
                    callback(new Error('Origin required in production'));
                    return;
                }
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
    }
});

console.log('🚀 WebSocket Server running on port 3001');

// 3. Handle Redis Events
redis.subscribe('event-updates', 'chat-messages', 'admin-events', 'user-updates', 'sports-odds', (err, count) => {
    if (err) console.error('Failed to subscribe: %s', err.message);
    else console.log(`Subscribed to ${count} Redis channels.`);
});

redis.on('message', (channel, message) => {
    console.log(`Received ${channel}:`, message);
    const data = JSON.parse(message);

    if (channel === 'event-updates') {
        // Broadcast to everyone looking at this event
        // Frontend listens for: socket.on('odds-update-123', data)
        io.emit(`odds-update-${data.eventId}`, data);
    }
    else if (channel === 'chat-messages') {
        // Broadcast chat message
        io.emit(`chat-message-${data.eventId}`, data);
    }
    else if (channel === 'admin-events') {
        // Broadcast admin events to all connected admin clients
        // data.type: 'event-created', 'event-updated', 'user-deleted', 'bet-placed', etc.
        io.emit(`admin:${data.type}`, data.payload);
    }
    else if (channel === 'user-updates') {
        // Broadcast to specific user room
        // data: { userId: '...', type: '...', payload: ... }
        if (data.userId) {
            io.to(`user:${data.userId}`).emit('user-update', data);
        }
    }
    else if (channel === 'sports-odds') {
        // Broadcast sports odds updates to all clients watching sports
        // data: { timestamp: '...', events: [...], count: ... }
        io.emit('sports:odds-update', data);
        
        // Also broadcast to specific sport rooms if needed
        if (data.eventsBySport) {
            Object.entries(data.eventsBySport).forEach(([sport, events]) => {
                io.to(`sport:${sport}`).emit('sports:odds-update', { sport, events });
            });
        }
    }
});

// 4. Handle Client Connections with Authentication
io.use((socket, next) => {
    // For public events (odds updates, chat), we allow unauthenticated connections
    // But we'll verify auth for user-specific rooms
    // Extract cookies from handshake
    const cookies = socket.handshake.headers.cookie;
    
    // Store cookies in socket for later use
    socket.data.cookies = cookies;
    
    // Allow connection but mark as unauthenticated
    // Individual event handlers will verify auth when needed
    next();
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Verify authentication for user-specific operations
    const verifyAuth = async (userId) => {
        if (!socket.data.cookies) {
            return false;
        }
        
        // In a real implementation, you'd verify the session token here
        // For now, we'll allow but log that auth verification is needed
        // TODO: Implement proper session verification via API call to main app
        return true;
    };

    socket.on('join-user-room', async (userId) => {
        if (!userId) {
            socket.emit('error', { message: 'User ID required' });
            return;
        }
        
        // Verify authentication before allowing user room access
        const isAuthenticated = await verifyAuth(userId);
        if (!isAuthenticated) {
            socket.emit('error', { message: 'Authentication required' });
            return;
        }
        
        console.log(`Socket ${socket.id} joining user room: user:${userId}`);
        socket.join(`user:${userId}`);
    });

    socket.on('leave-user-room', (userId) => {
        if (userId) {
            console.log(`Socket ${socket.id} leaving user room: user:${userId}`);
            socket.leave(`user:${userId}`);
        }
    });

    socket.on('join-sport', (sport) => {
        if (sport) {
            console.log(`Socket ${socket.id} joining sport room: sport:${sport}`);
            socket.join(`sport:${sport}`);
        }
    });

    socket.on('leave-sport', (sport) => {
        if (sport) {
            console.log(`Socket ${socket.id} leaving sport room: sport:${sport}`);
            socket.leave(`sport:${sport}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
