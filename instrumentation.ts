import { registerOTel } from '@vercel/otel';

function configureUptrace() {
    const dsn = process.env.UPTRACE_DSN;
    if (!dsn) {
        if (process.env.NODE_ENV === 'development') {
            console.info('[otel] UPTRACE_DSN not set; skipping Uptrace export');
        }
        return false;
    }

    const endpoint = process.env.UPTRACE_OTLP_ENDPOINT || 'https://otlp.uptrace.dev';

    // Only set OTLP settings if the app has not been configured already.
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||= endpoint;
    process.env.OTEL_EXPORTER_OTLP_HEADERS ||= `uptrace-dsn=${dsn}`;
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL ||= 'http/protobuf';

    // Allow tuning sampling without affecting other OTEL settings.
    if (!process.env.OTEL_TRACES_SAMPLER && process.env.UPTRACE_SAMPLE_RATIO) {
        process.env.OTEL_TRACES_SAMPLER = 'parentbased_traceidratio';
        process.env.OTEL_TRACES_SAMPLER_ARG ||= process.env.UPTRACE_SAMPLE_RATIO;
    }

    return true;
}

export async function register() {
    // Initialize Sentry for server-side error tracking
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
        if (process.env.NEXT_RUNTIME === 'nodejs') {
            await import('./sentry.server.config');
        }
        if (process.env.NEXT_RUNTIME === 'edge') {
            await import('./sentry.edge.config');
        }
    }

    // Initialize OpenTelemetry/Uptrace for distributed tracing
    const uptraceEnabled = configureUptrace();
    const serviceName = process.env.UPTRACE_SERVICE_NAME || 'polybet';
    const deploymentEnv = process.env.VERCEL_ENV || process.env.NODE_ENV;
    const region = process.env.VERCEL_REGION;
    const attributes: Record<string, string> = {};

    if (deploymentEnv) {
        attributes['deployment.environment'] = deploymentEnv;
    }

    if (region) {
        attributes['cloud.region'] = region;
    }

    registerOTel({
        serviceName,
        attributes,
    });

    if (uptraceEnabled && process.env.NODE_ENV === 'development') {
        console.info('[otel] Uptrace exporter configured for service', serviceName);
    }
}