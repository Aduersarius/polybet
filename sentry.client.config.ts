import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Set environment
    environment: process.env.NODE_ENV || "development",

    // Only send errors in production
    enabled: process.env.NODE_ENV === "production",

    // Ignore common non-actionable errors
    ignoreErrors: [
        // Network errors
        "Failed to fetch",
        "NetworkError",
        "Load failed",
        // User-initiated navigation
        "AbortError",
        // Browser extensions
        "chrome-extension://",
        "moz-extension://",
    ],

    // Filter out noisy transactions
    beforeSendTransaction(event) {
        // Don't send health check transactions
        if (event.transaction?.includes("/api/health")) {
            return null;
        }
        return event;
    },
});
