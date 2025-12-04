require('dotenv').config();
const { Server } = require('socket.io');
const Redis = require('ioredis');

// 1. Setup Redis Subscriber (Listens to Next.js Backend)
// If your Redis is on the same VPS, 'redis://localhost:6379' is fine.
// If you set a password (RECOMMENDED), use 'redis://:password@localhost:6379'
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// 2. Setup Socket.IO Server (Talks to Frontend Users)
const io = new Server(3001, {
    cors: {
        // Allow your Vercel app to connect
        origin: "*",
        methods: ["GET", "POST"]
    }
});

console.log('🚀 WebSocket Server running on port 3001');

// 3. Handle Redis Events
redis.subscribe('event-updates', 'chat-messages', 'admin-events', 'user-updates', (err, count) => {
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
});

// 4. Handle Client Connections
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-user-room', (userId) => {
        if (userId) {
            console.log(`Socket ${socket.id} joining user room: user:${userId}`);
            socket.join(`user:${userId}`);
        }
    });

    socket.on('leave-user-room', (userId) => {
        if (userId) {
            console.log(`Socket ${socket.id} leaving user room: user:${userId}`);
            socket.leave(`user:${userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
