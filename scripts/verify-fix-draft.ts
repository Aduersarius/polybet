import { io } from 'socket.io-client';
import fetch from 'node-fetch';

const WS_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:3000/api/hybrid-trading';

// Use a known event ID or create one. For this test, we'll try to find one or use a hardcoded one if we know it exists.
// Better to create a temporary event if possible, but for now let's assume we can pick one from the DB or use a known one.
// We'll use a placeholder and expect the user to have the server running.

async function verifyFix() {
    console.log('🚀 Starting verification...');

    // 1. Connect to WebSocket
    const socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: false
    });

    const eventId = 'test-event-id'; // We might need to fetch a real ID
    const option = 'YES';

    await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
            console.log('✅ Connected to WebSocket');
            resolve();
        });
        socket.on('connect_error', (err) => {
            console.error('❌ Connection error:', err);
            reject(err);
        });
    });

    // 2. Subscribe
    console.log(`Subscribing to event ${eventId}...`);
    socket.emit('join-event', eventId);
    socket.emit('subscribe-orderbook', { eventId, option });

    let orderbookReceived = false;
    let oddsReceived = false;

    socket.on('orderbook-update', (data) => {
        console.log('📦 Received orderbook update:', JSON.stringify(data, null, 2));
        if (data.bids && data.bids.length > 0 && data.asks && data.asks.length > 0) {
            console.log('✅ Orderbook has bids and asks!');
            orderbookReceived = true;
        } else {
            console.warn('⚠️ Orderbook is empty!');
        }
    });

    socket.on('odds-update', (data) => {
        console.log('📊 Received odds update:', JSON.stringify(data, null, 2));
        if (data.probs && (data.probs.YES || data.probs.NO)) {
            console.log('✅ Odds update contains probabilities!');
            oddsReceived = true;
        } else {
            console.warn('⚠️ Odds update missing probabilities!');
        }
    });

    // 3. Place a Trade
    // We need a real event ID for this to work.
    // Let's try to fetch one from the API or DB first? 
    // Since we don't have easy API access to list events without auth maybe, let's rely on the user providing one or picking one from the file list we saw earlier?
    // Actually, let's just create a dummy event using the existing scripts if needed, or query the DB.
    // For now, I'll just wait for updates. 

    // WAIT: I can't easily run this without a real event ID.
    // I should check `create-multiple-event-now.js` or similar to see how to make an event, OR just query the DB for an active event.
}

// verifyFix();
