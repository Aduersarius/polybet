import { io } from "socket.io-client";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const IS_LOCAL = process.env.STRESS_MODE !== 'production';
const NUM_CLIENTS = 500; // Number of concurrent WebSocket clients
const DURATION_MS = 15000; // Test duration in ms
const UPDATE_INTERVAL_MS = 200; // How often to trigger updates

// URLs
const WS_URL = process.env.WS_URL || (IS_LOCAL ? "http://localhost:3001" : "http://188.137.178.118:3001"); // Replace with your VPS IP
const API_URL = process.env.API_URL || (IS_LOCAL ? "http://localhost:3000" : "https://polybet.vercel.app");

// Metrics
let messagesReceived = 0;
let errors = 0;
let latencies: number[] = [];

async function runStressTest() {
    console.log(`🔥 Starting Stress Test (${IS_LOCAL ? 'LOCAL' : 'PRODUCTION'})`);
    console.log(`   - Clients: ${NUM_CLIENTS}`);
    console.log(`   - Duration: ${DURATION_MS / 1000}s`);
    console.log(`   - WS URL: ${WS_URL}`);
    console.log(`   - API URL: ${API_URL}`);

    // 1. Spawn Clients
    const clients: any[] = [];
    console.log(`\nCreating ${NUM_CLIENTS} WebSocket clients...`);

    for (let i = 0; i < NUM_CLIENTS; i++) {
        const socket = io(WS_URL, {
            transports: ["websocket"],
            forceNew: true,
            reconnection: false,
        });

        socket.on("connect", () => {
            // Subscribe to a specific event channel
            // socket.emit("subscribe", "event-updates"); // If your server requires explicit subscription
        });

        socket.on("connect_error", (err) => {
            errors++;
        });

        // Listen for the specific test event
        // The VPS broadcasts 'odds-update-{eventId}'
        socket.on("odds-update-stress-test", (data: any) => {
            messagesReceived++;
            const latency = Date.now() - data.timestamp;
            latencies.push(latency);
        });

        clients.push(socket);
    }

    // 2. Start Load Generation Loop (Triggering API)
    console.log("🚀 Starting load generation (triggering API)...");

    const interval = setInterval(async () => {
        try {
            const now = Date.now();
            const payload = {
                eventId: "stress-test",
                price: Math.random(),
                timestamp: now,
            };

            // Call the Next.js API to publish to Redis
            // This simulates a real user action or backend process updating odds
            await fetch(`${API_URL}/api/stress/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

        } catch (e) {
            console.error("Failed to trigger update:", e);
        }
    }, UPDATE_INTERVAL_MS);

    // 3. End Test
    setTimeout(async () => {
        clearInterval(interval);

        console.log("\n🛑 Stopping test...");

        // Cleanup
        clients.forEach((s) => s.disconnect());

        // Report
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
        const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0;

        console.log("\n📊 Results:");
        console.log(`- Total Messages Received: ${messagesReceived}`);
        console.log(`- Connection Errors: ${errors}`);
        console.log(`- Avg Latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`- P95 Latency: ${p95Latency.toFixed(2)}ms`);
        console.log(`- Throughput: ${(messagesReceived / (DURATION_MS / 1000)).toFixed(0)} msgs/sec`);

        process.exit(0);
    }, DURATION_MS);
}

runStressTest().catch(console.error);
