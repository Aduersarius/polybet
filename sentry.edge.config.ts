import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Performance Monitoring (lower sample rate for edge)
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,

    // Set environment
    environment: process.env.NODE_ENV || "development",

    // Only send errors in production
    enabled: process.env.NODE_ENV === "production",
});
