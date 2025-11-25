import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
    stages: [
        { duration: '10s', target: 50 },  // Ramp up to 50 users
        { duration: '30s', target: 50 },  // Stay at 50 users
        { duration: '10s', target: 100 }, // Ramp up to 100 users  
        { duration: '30s', target: 100 }, // Stay at 100 users
        { duration: '10s', target: 200 }, // Ramp up to 200 users
        { duration: '30s', target: 200 }, // Stay at 200 users
        { duration: '20s', target: 0 },   // Ramp down to 0
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'], // 95% of requests must complete below 5s
        http_req_failed: ['rate<0.1'],     // Error rate must be below 10%
        errors: ['rate<0.1'],              // Custom error rate below 10%
    },
};

const BASE_URL = __ENV.API_URL || 'https://www.polybet.ru';

// Sample event IDs (will be populated dynamically)
let eventIds = [];

export function setup() {
    // Fetch available events
    const res = http.get(`${BASE_URL}/api/events`);
    const events = JSON.parse(res.body).data;

    if (events && events.length > 0) {
        eventIds = events.slice(0, 10).map(e => e.id);
        console.log(`Loaded ${eventIds.length} events for testing`);
    }

    return { eventIds };
}

export default function (data) {
    const actions = [
        browseEvents,
        viewEventDetails,
        placeBet,
        searchEvents,
        viewMessages,
        postMessage,
    ];

    // Weighted random action selection
    const weights = [30, 25, 15, 10, 10, 10]; // Browse events most common
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const random = Math.random() * totalWeight;

    let weightSum = 0;
    let selectedAction = actions[0];

    for (let i = 0; i < actions.length; i++) {
        weightSum += weights[i];
        if (random <= weightSum) {
            selectedAction = actions[i];
            break;
        }
    }

    // Execute selected action
    selectedAction(data);

    // Random think time between requests
    sleep(Math.random() * 2 + 1); // 1-3 seconds
}

function browseEvents() {
    const res = http.get(`${BASE_URL}/api/events`);

    const success = check(res, {
        'browse events status 200': (r) => r.status === 200,
        'browse events has data': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.data && Array.isArray(body.data);
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
}

function viewEventDetails(data) {
    if (!data.eventIds || data.eventIds.length === 0) return;

    const eventId = data.eventIds[Math.floor(Math.random() * data.eventIds.length)];
    const res = http.get(`${BASE_URL}/api/events/${eventId}`);

    const success = check(res, {
        'view event status 200 or 404': (r) => r.status === 200 || r.status === 404,
    });

    errorRate.add(!success);
}

function placeBet(data) {
    if (!data.eventIds || data.eventIds.length === 0) return;

    const eventId = data.eventIds[Math.floor(Math.random() * data.eventIds.length)];
    const option = Math.random() > 0.5 ? 'YES' : 'NO';
    const amount = (Math.random() * 50 + 10).toFixed(2); // $10-$60

    const payload = JSON.stringify({
        eventId,
        option,
        amount,
        userId: `k6-user-${__VU}`, // Virtual user ID
    });

    const params = {
        headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(`${BASE_URL}/api/bets`, payload, params);

    const success = check(res, {
        'place bet status 200 or 429': (r) => r.status === 200 || r.status === 429 || r.status === 503,
    });

    errorRate.add(!success && res.status !== 429 && res.status !== 503);
}

function searchEvents() {
    const queries = ['crypto', 'politics', 'tech', 'finance', 'sports'];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const res = http.get(`${BASE_URL}/api/events/search?q=${query}`);

    const success = check(res, {
        'search status 200 or 429': (r) => r.status === 200 || r.status === 429,
    });

    errorRate.add(!success && res.status !== 429);
}

function viewMessages(data) {
    if (!data.eventIds || data.eventIds.length === 0) return;

    const eventId = data.eventIds[Math.floor(Math.random() * data.eventIds.length)];
    const res = http.get(`${BASE_URL}/api/events/${eventId}/messages`);

    const success = check(res, {
        'view messages status 200 or 429 or 404': (r) =>
            r.status === 200 || r.status === 429 || r.status === 404,
    });

    errorRate.add(!success && res.status !== 429);
}

function postMessage(data) {
    if (!data.eventIds || data.eventIds.length === 0) return;

    const eventId = data.eventIds[Math.floor(Math.random() * data.eventIds.length)];
    const messages = [
        'Great event!',
        'What do you think?',
        'This looks promising',
        'Not sure about this one',
        'Interesting odds',
    ];

    const payload = JSON.stringify({
        text: messages[Math.floor(Math.random() * messages.length)],
        userId: `k6-user-${__VU}`,
    });

    const params = {
        headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(`${BASE_URL}/api/events/${eventId}/messages`, payload, params);

    const success = check(res, {
        'post message status 200 or 429 or 503': (r) =>
            r.status === 200 || r.status === 429 || r.status === 503 || r.status === 404,
    });

    errorRate.add(!success && res.status !== 429 && res.status !== 503);
}

export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'k6-results.json': JSON.stringify(data),
    };
}

function textSummary(data, options) {
    const indent = options.indent || '';
    const enableColors = options.enableColors || false;

    let output = '\n';
    output += `${indent}✅ Test completed\n`;
    output += `${indent}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const metrics = data.metrics;

    if (metrics.http_reqs) {
        output += `${indent}📊 Requests: ${metrics.http_reqs.values.count}\n`;
        output += `${indent}⚡ RPS: ${metrics.http_reqs.values.rate.toFixed(2)}\n\n`;
    }

    if (metrics.http_req_duration) {
        output += `${indent}⏱️  Response Time:\n`;
        output += `${indent}  Avg: ${metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
        output += `${indent}  p50: ${metrics.http_req_duration.values['p(50)'].toFixed(2)}ms\n`;
        output += `${indent}  p95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
        output += `${indent}  p99: ${(metrics.http_req_duration.values['p(99)'] || 0).toFixed(2)}ms\n`;
        output += `${indent}  Max: ${metrics.http_req_duration.values.max.toFixed(2)}ms\n\n`;
    }

    if (metrics.http_req_failed) {
        const failRate = (metrics.http_req_failed.values.rate * 100).toFixed(2);
        output += `${indent}❌ Failed Requests: ${failRate}%\n`;
    }

    if (metrics.errors) {
        const errorRateValue = (metrics.errors.values.rate * 100).toFixed(2);
        output += `${indent}⚠️  Error Rate: ${errorRateValue}%\n`;
    }

    output += `\n${indent}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    return output;
}
