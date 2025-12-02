import { io } from 'socket.io-client';


const WS_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:3000/api/hybrid-trading';
const EVENT_ID = 'btc-100k-2025';

async function verifyFix() {
    console.log('🚀 Starting verification...');

    // 1. Connect to WebSocket
    const socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: false
    });

    await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
            console.log('✅ Connected to WebSocket');
            resolve();
        });
        socket.on('connect_error', (err) => {
            console.error('❌ Connection error:', err);
            reject(err);
        });
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // 2. Subscribe
    console.log(`Subscribing to event ${EVENT_ID}...`);
    socket.emit('join-event', EVENT_ID);
    socket.emit('subscribe-orderbook', { eventId: EVENT_ID, option: 'YES' });

    let orderbookReceived = false;
    let oddsReceived = false;

    socket.on('orderbook-update', (data) => {
        if (data.eventId === EVENT_ID) {
            console.log('📦 Received orderbook update');
            if (data.bids && data.bids.length > 0 && data.asks && data.asks.length > 0) {
                console.log('✅ Orderbook has bids and asks!');
                orderbookReceived = true;
            } else {
                console.warn('⚠️ Orderbook is empty!');
            }
        }
    });

    socket.on('odds-update', (data) => {
        if (data.eventId === EVENT_ID) {
            console.log('📊 Received odds update');
            if (data.probs && (data.probs.YES || data.probs.NO)) {
                console.log(`✅ Odds update contains probabilities! YES: ${data.probs.YES}, NO: ${data.probs.NO}`);
                oddsReceived = true;
            } else {
                console.warn('⚠️ Odds update missing probabilities!');
            }
        }
    });

    // 3. Place a Trade
    console.log('💸 Placing a trade...');
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eventId: EVENT_ID,
                side: 'buy',
                option: 'YES',
                amount: 10, // Small amount
                userId: 'cminhk477000002s8jld69y1f' // Dev user ID from codebase
            })
        });

        const result = await response.json();
        console.log('Trade result:', result);

        if (!response.ok) {
            throw new Error(`Trade failed: ${JSON.stringify(result)}`);
        }
    } catch (error) {
        console.error('❌ Failed to place trade:', error);
        process.exit(1);
    }

    // 4. Wait for updates
    console.log('⏳ Waiting for updates...');
    await new Promise(r => setTimeout(r, 5000));

    if (orderbookReceived && oddsReceived) {
        console.log('🎉 VERIFICATION SUCCESSFUL: Both orderbook and odds updates received correctly.');
        process.exit(0);
    } else {
        console.error('❌ VERIFICATION FAILED: Missing updates.');
        if (!orderbookReceived) console.error('- No valid orderbook update received');
        if (!oddsReceived) console.error('- No valid odds update received');
        process.exit(1);
    }
}

verifyFix().catch(console.error);
