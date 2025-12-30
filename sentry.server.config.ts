// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: "https://88d79c5c40a6ad1735628a838f76d66b@o4510590536581120.ingest.us.sentry.io/4510590537629696",

  // Add profiling integration
  integrations: [nodeProfilingIntegration()],

  // Trace sampling: 10% in production, 100% in development
  // This prevents quota exhaustion while still capturing representative data
  tracesSampleRate: isProduction ? 0.1 : 1.0,

  // Profile 100% of sampled transactions in dev, 10% in production
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
