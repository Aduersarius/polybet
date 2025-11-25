#!/usr/bin/env tsx
/**
 * PolyBet Load Testing Script
 * 
 * Tests API endpoints, database, and overall system performance
 * Usage:
 *   - Local:      npx tsx load-test.ts
 *   - Production: API_URL=https://polybet.vercel.app npx tsx load-test.ts
 *   - Custom:     API_URL=... CONCURRENT=100 DURATION=60 npx tsx load-test.ts
 */

import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    API_URL: process.env.API_URL || 'http://localhost:3000',
    CONCURRENT_USERS: parseInt(process.env.CONCURRENT || '50'),
    TEST_DURATION_SEC: parseInt(process.env.DURATION || '60'),
    RAMP_UP_SEC: parseInt(process.env.RAMP_UP || '10'),
    THINK_TIME_MS: parseInt(process.env.THINK_TIME || '500'), // Delay between requests
};

console.log('🚀 PolyBet Load Test Configuration:');
console.log(`   API URL: ${CONFIG.API_URL}`);
console.log(`   Concurrent Users: ${CONFIG.CONCURRENT_USERS}`);
console.log(`   Duration: ${CONFIG.TEST_DURATION_SEC}s`);
console.log(`   Ramp-up: ${CONFIG.RAMP_UP_SEC}s`);
console.log('');

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface Metrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    latencies: number[];
    errorsByEndpoint: Map<string, number>;
    requestsByEndpoint: Map<string, number>;
}

const metrics: Metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencies: [],
    errorsByEndpoint: new Map(),
    requestsByEndpoint: new Map(),
};

// ============================================================================
// API CLIENT
// ============================================================================

async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<{
    success: boolean;
    latency: number;
    status: number;
    data?: any;
}> {
    const url = `${CONFIG.API_URL}${endpoint}`;
    const start = Date.now();

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const latency = Date.now() - start;
        const success = response.ok;

        // Track metrics
        metrics.totalRequests++;
        metrics.latencies.push(latency);
        metrics.requestsByEndpoint.set(
            endpoint,
            (metrics.requestsByEndpoint.get(endpoint) || 0) + 1
        );

        if (success) {
            metrics.successfulRequests++;
        } else {
            metrics.failedRequests++;
            metrics.errorsByEndpoint.set(
                endpoint,
                (metrics.errorsByEndpoint.get(endpoint) || 0) + 1
            );
        }

        let data;
        try {
            data = await response.json();
        } catch (e) {
            // Response might not be JSON
        }

        return { success, latency, status: response.status, data };

    } catch (error) {
        const latency = Date.now() - start;
        metrics.totalRequests++;
        metrics.failedRequests++;
        metrics.latencies.push(latency);
        metrics.errorsByEndpoint.set(
            endpoint,
            (metrics.errorsByEndpoint.get(endpoint) || 0) + 1
        );

        return { success: false, latency, status: 0 };
    }
}

// ============================================================================
// USER SCENARIOS
// ============================================================================

let cachedEvents: any[] = [];

async function scenario_browseEvents(): Promise<void> {
    // 1. Fetch all events
    const eventsRes = await apiRequest('/api/events');

    if (eventsRes.success && eventsRes.data) {
        cachedEvents = eventsRes.data;
    }

    await sleep(CONFIG.THINK_TIME_MS);
}

async function scenario_viewEventDetails(): Promise<void> {
    if (cachedEvents.length === 0) {
        await scenario_browseEvents();
    }

    if (cachedEvents.length === 0) return;

    // 2. Pick a random event and view details
    const randomEvent = cachedEvents[Math.floor(Math.random() * cachedEvents.length)];
    await apiRequest(`/api/events/${randomEvent.id}`);

    await sleep(CONFIG.THINK_TIME_MS);

    // 3. Fetch messages for this event
    await apiRequest(`/api/events/${randomEvent.id}/messages`);

    await sleep(CONFIG.THINK_TIME_MS);
}

async function scenario_placeBet(): Promise<void> {
    if (cachedEvents.length === 0) {
        await scenario_browseEvents();
    }

    if (cachedEvents.length === 0) return;

    // 4. Place a bet
    const randomEvent = cachedEvents[Math.floor(Math.random() * cachedEvents.length)];
    const randomOption = Math.random() > 0.5 ? 'YES' : 'NO';
    const randomAmount = Math.floor(Math.random() * 100) + 10;

    await apiRequest('/api/bets', {
        method: 'POST',
        body: JSON.stringify({
            eventId: randomEvent.id,
            option: randomOption,
            amount: randomAmount,
            // userId field is optional - defaults to 'dev-user' if not provided
        }),
    });

    await sleep(CONFIG.THINK_TIME_MS);
}

async function scenario_postMessage(): Promise<void> {
    if (cachedEvents.length === 0) {
        await scenario_browseEvents();
    }

    if (cachedEvents.length === 0) return;

    // 5. Post a message
    const randomEvent = cachedEvents[Math.floor(Math.random() * cachedEvents.length)];

    await apiRequest(`/api/events/${randomEvent.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
            text: `Load test message ${Date.now()}`,
        }),
    });

    await sleep(CONFIG.THINK_TIME_MS);
}

async function scenario_searchEvents(): Promise<void> {
    // 6. Search events
    const searchTerms = ['crypto', 'sports', 'politics', 'tech', 'finance'];
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    await apiRequest(`/api/events/search?q=${randomTerm}`);

    await sleep(CONFIG.THINK_TIME_MS);
}

async function scenario_viewUserProfile(): Promise<void> {
    // 7. View user profile
    const mockAddress = `0x${Math.random().toString(36).substring(7)}`;

    await apiRequest(`/api/users/${mockAddress}`);

    await sleep(CONFIG.THINK_TIME_MS);
}

// ============================================================================
// VIRTUAL USER
// ============================================================================

async function virtualUser(userId: number): Promise<void> {
    const scenarios = [
        { fn: scenario_browseEvents, weight: 30 },
        { fn: scenario_viewEventDetails, weight: 25 },
        { fn: scenario_placeBet, weight: 15 },
        { fn: scenario_postMessage, weight: 10 },
        { fn: scenario_searchEvents, weight: 10 },
        { fn: scenario_viewUserProfile, weight: 10 },
    ];

    // Weighted random selection
    const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;

    for (const scenario of scenarios) {
        random -= scenario.weight;
        if (random <= 0) {
            await scenario.fn();
            break;
        }
    }
}

// ============================================================================
// LOAD GENERATOR
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLoadTest(): Promise<void> {
    console.log('🔥 Starting load test...\n');

    const startTime = Date.now();
    const endTime = startTime + (CONFIG.TEST_DURATION_SEC * 1000);

    const activeUsers: Set<Promise<void>> = new Set();
    let usersSpawned = 0;

    // Ramp up users gradually
    const rampUpInterval = (CONFIG.RAMP_UP_SEC * 1000) / CONFIG.CONCURRENT_USERS;

    const spawnInterval = setInterval(() => {
        if (usersSpawned >= CONFIG.CONCURRENT_USERS) {
            clearInterval(spawnInterval);
            return;
        }

        const userPromise = (async () => {
            while (Date.now() < endTime) {
                await virtualUser(usersSpawned);
            }
        })();

        activeUsers.add(userPromise);
        userPromise.finally(() => activeUsers.delete(userPromise));

        usersSpawned++;

        if (usersSpawned % 10 === 0) {
            console.log(`👥 Spawned ${usersSpawned}/${CONFIG.CONCURRENT_USERS} users...`);
        }
    }, rampUpInterval);

    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, CONFIG.TEST_DURATION_SEC * 1000));

    // Wait for all active users to finish their current request
    console.log('\n⏳ Waiting for active users to complete...');
    await Promise.all(Array.from(activeUsers));

    // Report results
    reportResults();
}

// ============================================================================
// REPORTING
// ============================================================================

function reportResults(): void {
    console.log('\n');
    console.log('='.repeat(80));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(80));

    // Summary
    console.log('\n📈 Summary:');
    console.log(`   Total Requests:      ${metrics.totalRequests}`);
    console.log(`   Successful:          ${metrics.successfulRequests} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`   Failed:              ${metrics.failedRequests} (${((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`   Requests/sec:        ${(metrics.totalRequests / CONFIG.TEST_DURATION_SEC).toFixed(2)}`);

    // Latency
    if (metrics.latencies.length > 0) {
        const sorted = metrics.latencies.sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const max = sorted[sorted.length - 1];

        console.log('\n⚡ Latency (ms):');
        console.log(`   Average:             ${avg.toFixed(2)}ms`);
        console.log(`   Median (p50):        ${p50}ms`);
        console.log(`   p95:                 ${p95}ms`);
        console.log(`   p99:                 ${p99}ms`);
        console.log(`   Max:                 ${max}ms`);
    }

    // Errors by endpoint
    if (metrics.errorsByEndpoint.size > 0) {
        console.log('\n❌ Errors by Endpoint:');
        for (const [endpoint, count] of metrics.errorsByEndpoint) {
            console.log(`   ${endpoint}: ${count}`);
        }
    }

    // Requests by endpoint
    console.log('\n📍 Requests by Endpoint:');
    const sortedEndpoints = Array.from(metrics.requestsByEndpoint.entries())
        .sort((a, b) => b[1] - a[1]);

    for (const [endpoint, count] of sortedEndpoints.slice(0, 10)) {
        const errorCount = metrics.errorsByEndpoint.get(endpoint) || 0;
        const successRate = ((count - errorCount) / count * 100).toFixed(1);
        console.log(`   ${endpoint.padEnd(40)} ${count.toString().padStart(6)} (${successRate}% success)`);
    }

    console.log('\n' + '='.repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    try {
        await runLoadTest();
        process.exit(0);
    } catch (error) {
        console.error('❌ Load test failed:', error);
        process.exit(1);
    }
}

main();
