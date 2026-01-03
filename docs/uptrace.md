## Uptrace Monitoring

The Next.js instrumentation is wired to send OpenTelemetry traces to Uptrace when a DSN is provided.

Required:
- `UPTRACE_DSN` – project DSN from Uptrace settings (kept secret).

Optional:
- `UPTRACE_OTLP_ENDPOINT` – OTLP/HTTP endpoint (defaults to `https://otlp.uptrace.dev`).
- `UPTRACE_SERVICE_NAME` – overrides the service name (default `pariflow`).
- `UPTRACE_SAMPLE_RATIO` – sets `OTEL_TRACES_SAMPLER_ARG` for sampling (e.g. `0.2` for 20%).

When `UPTRACE_DSN` is set, the app configures `OTEL_EXPORTER_OTLP_*` variables at startup so spans are exported automatically. Without it, tracing falls back to the default behavior.

