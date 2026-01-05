/**
 * Sentry Custom Metrics Utility
 * 
 * Use these helpers to track important business and performance metrics.
 * Compatible with Sentry SDK v10.x which uses:
 * - Sentry.metrics.count() for counters
 * - Sentry.metrics.distribution() for timing/values
 * - Sentry.metrics.gauge() for current values
 * 
 * Tags are passed via the `attributes` option.
 */

import * as Sentry from "@sentry/nextjs";

// Type for attributes
type Attributes = Record<string, string | number | boolean>;

// ============================================================================
// API & Performance Metrics
// ============================================================================

/**
 * Track API endpoint response time
 */
export function trackApiLatency(
    endpoint: string,
    durationMs: number,
    status: number
) {
    Sentry.metrics.distribution("api.latency", durationMs, {
        unit: "millisecond",
        attributes: {
            endpoint,
            status: String(status),
            status_class: status >= 500 ? "5xx" : status >= 400 ? "4xx" : "2xx",
        },
    });
}

/**
 * Track database query performance
 */
export function trackDbQuery(
    operation: "select" | "insert" | "update" | "delete",
    table: string,
    durationMs: number
) {
    Sentry.metrics.distribution("db.query_time", durationMs, {
        unit: "millisecond",
        attributes: { operation, table },
    });
}

/**
 * Track external API calls (Polymarket, Redis, etc.)
 */
export function trackExternalApi(
    service: "polymarket" | "redis" | "resend" | "telegram" | "openrouter",
    operation: string,
    durationMs: number,
    success: boolean
) {
    Sentry.metrics.distribution("external_api.latency", durationMs, {
        unit: "millisecond",
        attributes: { service, operation, success: String(success) },
    });

    if (!success) {
        Sentry.metrics.count("external_api.errors", 1, {
            attributes: { service, operation },
        });
    }
}

// ============================================================================
// Trading & Business Metrics
// ============================================================================

/**
 * Track trade execution
 */
export function trackTrade(
    side: "buy" | "sell",
    outcome: "yes" | "no",
    amount: number,
    eventType: "binary" | "multiple" | "grouped"
) {
    Sentry.metrics.count("trades.count", 1, {
        attributes: { side, outcome, event_type: eventType },
    });

    Sentry.metrics.distribution("trades.amount", amount, {
        attributes: { side, outcome },
    });
}

/**
 * Track order book operations
 */
export function trackOrderBook(
    action: "place" | "cancel" | "fill" | "partial_fill",
    side: "buy" | "sell",
    amount: number,
    durationMs?: number
) {
    Sentry.metrics.count("orderbook.operations", 1, {
        attributes: { action, side },
    });

    if (durationMs !== undefined) {
        Sentry.metrics.distribution("orderbook.latency", durationMs, {
            unit: "millisecond",
            attributes: { action },
        });
    }
}

/**
 * Track deposits and withdrawals
 */
export function trackTransaction(
    type: "deposit" | "withdrawal",
    status: "pending" | "completed" | "failed" | "auto_approved",
    amount: number
) {
    Sentry.metrics.count(`transactions.${type}`, 1, {
        attributes: { status },
    });

    if (status === "completed") {
        Sentry.metrics.distribution(`transactions.${type}_amount`, amount);
    }
}

// ============================================================================
// User Activity Metrics
// ============================================================================

/**
 * Track user authentication events
 */
export function trackAuth(
    action: "login" | "logout" | "signup" | "password_reset" | "email_verify",
    method: "email" | "google" | "telegram" | "magic_link" = "email",
    success: boolean = true
) {
    Sentry.metrics.count("auth.events", 1, {
        attributes: { action, method, success: String(success) },
    });
}

/**
 * Track unique active users via counter (set not available in v10)
 */
export function trackActiveUser(userId: string) {
    // Note: Sentry v10 doesn't have metrics.set, use count with userId attribute
    Sentry.metrics.count("users.active_session", 1, {
        attributes: { user_id_prefix: userId.slice(0, 8) },
    });
}

/**
 * Track page views with performance data
 */
export function trackPageView(page: string, loadTimeMs?: number) {
    Sentry.metrics.count("pages.views", 1, {
        attributes: { page },
    });

    if (loadTimeMs !== undefined) {
        Sentry.metrics.distribution("pages.load_time", loadTimeMs, {
            unit: "millisecond",
            attributes: { page },
        });
    }
}

/**
 * Track user interactions
 */
export function trackUserAction(
    action: string,
    category: "navigation" | "trading" | "social" | "settings" | "support",
    metadata?: Attributes
) {
    Sentry.metrics.count("user.actions", 1, {
        attributes: { action, category, ...metadata },
    });
}

// ============================================================================
// Event & Market Metrics
// ============================================================================

/**
 * Track event views
 */
export function trackEventView(eventId: string, eventType: string) {
    Sentry.metrics.count("events.views", 1, {
        attributes: { event_type: eventType },
    });
}

/**
 * Track market activity
 */
export function trackMarketActivity(
    eventId: string,
    action: "bet_placed" | "comment" | "favorite" | "share"
) {
    Sentry.metrics.count("market.activity", 1, {
        attributes: { action },
    });
}

// ============================================================================
// Support & Admin Metrics
// ============================================================================

/**
 * Track support ticket operations
 */
export function trackSupportTicket(
    action: "created" | "assigned" | "resolved" | "closed",
    priority: "low" | "medium" | "high" | "critical",
    category?: string
) {
    Sentry.metrics.count("support.tickets", 1, {
        attributes: { action, priority, category: category || "general" },
    });
}

/**
 * Track admin operations
 */
export function trackAdminAction(
    action: string,
    resource: "event" | "user" | "withdrawal" | "hedging" | "polymarket"
) {
    Sentry.metrics.count("admin.actions", 1, {
        attributes: { action, resource },
    });
}

// ============================================================================
// Infrastructure Metrics
// ============================================================================

/**
 * Track WebSocket connections
 */
export function trackWebSocket(
    action: "connect" | "disconnect" | "message" | "error",
    channel?: string
) {
    Sentry.metrics.count("websocket.events", 1, {
        attributes: { action, channel: channel || "unknown" },
    });
}

/**
 * Track cache operations
 */
export function trackCache(
    operation: "hit" | "miss" | "set" | "delete",
    cache: "redis" | "memory",
    key_prefix: string
) {
    Sentry.metrics.count("cache.operations", 1, {
        attributes: { operation, cache, key_prefix },
    });
}

/**
 * Track queue operations (if you add job queues later)
 */
export function trackQueue(
    queue: string,
    action: "enqueue" | "process" | "complete" | "fail",
    durationMs?: number
) {
    Sentry.metrics.count("queue.jobs", 1, {
        attributes: { queue, action },
    });

    if (durationMs !== undefined && action === "complete") {
        Sentry.metrics.distribution("queue.processing_time", durationMs, {
            unit: "millisecond",
            attributes: { queue },
        });
    }
}

// ============================================================================
// Timing Utility
// ============================================================================

/**
 * Utility to measure and report timing for any operation
 * 
 * Usage:
 * const timer = startTimer();
 * await doSomething();
 * timer.finish("my_operation", { tag: "value" });
 */
export function startTimer() {
    const start = performance.now();

    return {
        finish(metricName: string, attributes?: Attributes) {
            const duration = performance.now() - start;
            Sentry.metrics.distribution(metricName, duration, {
                unit: "millisecond",
                attributes,
            });
            return duration;
        },

        elapsed() {
            return performance.now() - start;
        },
    };
}

// ============================================================================
// Error Rate Tracking
// ============================================================================

/**
 * Track error rates by category
 */
export function trackError(
    category: "api" | "auth" | "trading" | "payment" | "external" | "unknown",
    errorType: string
) {
    Sentry.metrics.count("errors.count", 1, {
        attributes: { category, error_type: errorType },
    });
}

// ============================================================================
// Gauge Metrics (Current State)
// ============================================================================

/**
 * Track current queue depth or similar "current value" metrics
 */
export function setGauge(name: string, value: number, attributes?: Attributes) {
    Sentry.metrics.gauge(name, value, { attributes });
}

/**
 * Track active connections, users online, etc.
 */
export function trackActiveConnections(count: number, type: string) {
    Sentry.metrics.gauge("connections.active", count, {
        attributes: { type },
    });
}
