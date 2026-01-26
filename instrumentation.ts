import 'newrelic';
import { registerOTel } from '@vercel/otel';
import type { MetricReader } from '@opentelemetry/sdk-metrics';

export async function register() {
    const metricReaders: MetricReader[] = [];

    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
        const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
        const { HostMetrics } = await import('@opentelemetry/host-metrics');

        // Metrics export
        metricReaders.push(
            new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter({
                    url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
                        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
                        'http://212.69.87.149:4318/v1/metrics',
                }),
                exportIntervalMillis: 10000,
            }),
        );

        // Enable collection of host metrics (CPU, Memory, etc.)
        const hostMetrics = new HostMetrics({
            name: 'host-metrics',
        });
        hostMetrics.start();

        // Trace export configuration
        const traceExporter = new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
                process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
                'http://212.69.87.149:4318/v1/traces',
        });

        registerOTel({
            serviceName: process.env.OTEL_SERVICE_NAME || 'pariflow',
            metricReaders,
            traceExporter,
        });

        console.log('[OTEL] ✅ APM initialized - metrics + traces enabled');
    } else {
        // Edge runtime - basic registration
        registerOTel({
            serviceName: process.env.OTEL_SERVICE_NAME || 'pariflow',
        });
    }
}
