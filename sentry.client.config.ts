// This file configures the initialization of Sentry on the client.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: "https://88d79c5c40a6ad1735628a838f76d66b@o4510590536581120.ingest.us.sentry.io/4510590537629696",

    // Integrations for client-side monitoring
    integrations: [
        // Session Replay for debugging user issues
        Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: false,
        }),
        // Browser profiling (captures JS execution time)
        Sentry.browserProfilingIntegration(),
        // User feedback collection (manually triggered from Footer)
        Sentry.feedbackIntegration({
            colorScheme: "dark",
            autoInject: false, // We'll trigger it manually from Footer
            showBranding: false,
            buttonLabel: "Feedback",
            submitButtonLabel: "Send Feedback",
            formTitle: "Send us feedback",
            messagePlaceholder: "What's on your mind? Found a bug? Have a suggestion?",
            successMessageText: "Thanks for your feedback!",
        }),
    ],

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Profile sample rate (relative to tracesSampleRate)
    profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Session Replay sample rates
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    // Set environment
    environment: process.env.NODE_ENV || "development",

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
