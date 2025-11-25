import Redis from 'ioredis';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const REDIS_URL = process.env.REDIS_URL;
const WS_URL = 'http://188.137.178.118:3001';
const EVENT_ID = 'debug-test-' + Date.now();

async function runDebug() {
    console.log('🔍 Starting WebSocket Debugger');
    console.log(`   Redis: ${REDIS_URL?.replace(/:[^@]+@/, ':***@')}`); // Mask password
    console.log(`   WS:    ${WS_URL}`);
    console.log(`   Event: ${EVENT_ID}`);

    // 1. Connect to WebSocket
    console.log('\n1. Connecting to WebSocket...');
    const socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: false,
    });

    const wsPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('WebSocket timeout - did not receive message'));
        }, 10000);

        socket.on('connect', () => {
            console.log('✅ WebSocket connected:', socket.id);
        });

        socket.on('connect_error', (err) => {
            console.error('❌ WebSocket connection error:', err.message);
            clearTimeout(timeout);
            reject(err);
        });

        // Listen for the specific event
        const eventName = `odds-update-${EVENT_ID}`;
        console.log(`   Listening for: ${eventName}`);

        socket.on(eventName, (data) => {
            console.log('✅ Received WebSocket message:', data);
            clearTimeout(timeout);
            resolve();
        });
    });

    // 2. Publish to Redis
    console.log('\n2. Connecting to Redis...');
    try {
        if (!REDIS_URL) throw new Error('REDIS_URL not set');

        const redis = new Redis(REDIS_URL);

        await new Promise<void>((resolve) => {
            redis.on('ready', () => {
                console.log('✅ Redis connected');
                resolve();
            });
            redis.on('error', (err) => console.error('Redis error:', err.message));
        });

        // Wait a bit for WS to be ready
        await new Promise(r => setTimeout(r, 1000));

        console.log('\n3. Publishing test message...');
        const payload = {
            eventId: EVENT_ID,
            yesPrice: 0.5,
            timestamp: Date.now(),
            debug: true
        };

        const channel = 'event-updates';
        const count = await redis.publish(channel, JSON.stringify(payload));
        console.log(`✅ Published to channel '${channel}'. Subscribers: ${count}`);

        if (count === 0) {
            console.warn('⚠️ WARNING: No subscribers on this channel! VPS might not be connected to Redis.');
        }

        redis.disconnect();

    } catch (error) {
        console.error('❌ Redis error:', error);
    }

    // 3. Wait for result
    try {
        await wsPromise;
        console.log('\n🎉 SUCCESS: Message flow verified!');
    } catch (error) {
        console.error('\n❌ FAILURE:', error);
    } finally {
        socket.disconnect();
        process.exit(0);
    }
}

runDebug().catch(console.error);
