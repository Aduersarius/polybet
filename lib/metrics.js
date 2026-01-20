import { metrics } from '@opentelemetry/api';
const meter = metrics.getMeter('pariflow-app');
export const eventRequestsCounter = meter.createCounter('events_api_requests', {
    description: 'Count of requests to the events API',
});
export const eventSearchCounter = meter.createCounter('events_api_searches', {
    description: 'Count of search queries in events API',
});
export const tradeCounter = meter.createCounter('trades_executed', {
    description: 'Count of trades executed',
});
export const polymarketSyncHistogram = meter.createHistogram('polymarket_sync_duration', {
    description: 'Duration of Polymarket sync operations',
    unit: 'ms',
});
export const authLoginCounter = meter.createCounter('auth_logins_total', { description: 'Total login attempts' });
export const auth2faCounter = meter.createCounter('auth_2fa_total', { description: 'Total 2FA verifications' });
export const hedgeOperationCounter = meter.createCounter('hedge_operations_total', { description: 'Hedge operations (calc, exec, liquidity)' });
export const hedgeDurationHistogram = meter.createHistogram('hedge_duration_ms', { description: 'Hedge operation duration', unit: 'ms' });
export const hedgeSplitCounter = meter.createCounter('hedge_split_orders_total', { description: 'Split hedge orders' });
export const dbQueryCounter = meter.createCounter('db_queries_total', { description: 'Total database queries' });
export const dbQueryHistogram = meter.createHistogram('db_query_duration_ms', { description: 'Database query duration', unit: 'ms' });
export const redisCommandCounter = meter.createCounter('redis_commands_total', { description: 'Total Redis commands' });
export const redisDurationHistogram = meter.createHistogram('redis_command_duration_ms', { description: 'Redis command duration', unit: 'ms' });
// We'll export a register function for the circuit breaker gauge to avoid circular deps
export function registerCircuitBreakerGauge(callback) {
    meter.createObservableGauge('circuit_breaker_state', {
        description: 'Circuit Breaker State (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
    }).addCallback(callback);
}
export function trackAuthEvent(type, status, method) {
    if (type === 'login') {
        authLoginCounter.add(1, { status, method: method || 'unknown' });
    }
    else {
        auth2faCounter.add(1, { status });
    }
}
export function trackHedgeEvent(operation, status, duration, extras) {
    const attrs = { operation, status, ...extras };
    hedgeOperationCounter.add(1, attrs);
    if (duration !== undefined) {
        hedgeDurationHistogram.record(duration, { operation, status });
    }
}
// --- Legacy Sentry Replacements (OTel-backed) ---
export const errorsCounter = meter.createCounter('app_errors_total', { description: 'Total application errors' });
export const apiLatencyHistogram = meter.createHistogram('api_latency_ms', { unit: 'ms', description: 'API Endpoint Latency' });
export const externalApiHistogram = meter.createHistogram('external_api_duration_ms', { unit: 'ms', description: 'External Service Duration' });
export const transactionCounter = meter.createCounter('transactions_total', { description: 'Identify deposits/withdrawals' });
export function trackTrade(side, outcome, amount, type) {
    let attributes = {};
    if (typeof side === 'object') {
        // Handle object signature
        for (const [k, v] of Object.entries(side)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                attributes[k] = v;
            }
        }
    }
    else {
        // Handle legacy signature: (side, outcome, amount, type)
        attributes = {
            side,
            outcome: outcome || 'unknown',
            amount: amount,
            type: type || 'std'
        };
    }
    tradeCounter.add(1, attributes);
}
export function trackError(errorOrCategory, messageOrContext) {
    const attributes = {};
    let errorObj = errorOrCategory;
    if (typeof errorOrCategory === 'string') {
        // Legacy: trackError('category', 'message')
        attributes['error.category'] = errorOrCategory;
        attributes['error.message'] = typeof messageOrContext === 'string' ? messageOrContext : String(messageOrContext);
        // Create a synthetic error for console
        errorObj = new Error(attributes['error.message']);
    }
    else {
        // Standard: trackError(error, context)
        if (messageOrContext && typeof messageOrContext === 'object') {
            Object.assign(attributes, messageOrContext);
        }
        if (errorOrCategory instanceof Error) {
            attributes['error.name'] = errorOrCategory.name;
            attributes['error.message'] = errorOrCategory.message;
        }
        else {
            attributes['error.message'] = String(errorOrCategory);
        }
    }
    errorsCounter.add(1, attributes);
    console.error('Tracked Error:', errorObj);
}
export function trackApiLatency(route, duration, status) {
    const attributes = { route };
    if (status)
        attributes['http.status_code'] = status;
    apiLatencyHistogram.record(duration, attributes);
}
export function trackExternalApi(service, operation, duration, success = true) {
    externalApiHistogram.record(duration, { service, operation, success: String(success) });
}
export function trackTransaction(type, status, amount, token = 'USDC') {
    // Handle overload/mixed types from legacy usage
    // Legacy might have been: (type, status, amount)
    // Or (type, amount, token) - wait, looking at errors, it was (type, status, amount)
    // If usage is trackTransaction('withdrawal', 'pending', amount)
    const safeAmount = typeof amount === 'number' ? amount : Number(amount || 0);
    transactionCounter.add(1, {
        type,
        status: String(status),
        token
    });
}
export function startTimer() {
    const start = performance.now();
    return () => performance.now() - start;
}
