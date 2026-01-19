import { registerOTel } from '@vercel/otel';
import type { MetricReader } from '@opentelemetry/sdk-metrics';

export async function register() {
    const metricReaders: MetricReader[] = [];

    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
        const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
        const { HostMetrics } = await import('@opentelemetry/host-metrics');

        metricReaders.push(
            new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter(),
                exportIntervalMillis: 10000,
            }),
        );

        // Enable collection of host metrics (CPU, Memory, etc.)
        const hostMetrics = new HostMetrics({
            name: 'host-metrics',
        });
        hostMetrics.start();
    }

    registerOTel({
        serviceName: process.env.OTEL_SERVICE_NAME || 'pariflow',
        metricReaders,
    });
}