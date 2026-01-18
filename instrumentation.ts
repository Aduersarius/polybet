import { registerOTel } from '@vercel/otel';

export async function register() {


    // Initialize OpenTelemetry
    // Using standard env vars: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME
    registerOTel({
        serviceName: process.env.OTEL_SERVICE_NAME || 'pariflow',
    });
}