// ============================================
// APM / DISTRIBUTED TRACING HELPERS
// ============================================

import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Get the tracer instance for creating custom spans
 */
export function getTracer(name: string = 'pariflow') {
    return trace.getTracer(name);
}

/**
 * Execute a function within a traced span
 * Automatically handles span lifecycle, error tracking, and attributes
 * 
 * @example
 * const result = await withSpan('executeHedge', async (span) => {
 *   span.setAttribute('hedge.amount', amount);
 *   return await doWork();
 * }, { operation: 'hedge', marketId });
 */
export async function withSpan<T>(
    spanName: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, any>
): Promise<T> {
    const tracer = getTracer();
    return tracer.startActiveSpan(spanName, async (span) => {
        try {
            // Add custom attributes
            if (attributes) {
                Object.entries(attributes).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        span.setAttribute(key, String(value));
                    }
                });
            }

            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            // Record error in span
            span.recordException(error as Error);
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
            });
            throw error;
        } finally {
            span.end();
        }
    });
}

/**
 * Create a span for synchronous operations
 * Must manually call span.end() when done
 */
export function startSpan(spanName: string, attributes?: Record<string, any>): Span {
    const tracer = getTracer();
    const span = tracer.startSpan(spanName);

    if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                span.setAttribute(key, String(value));
            }
        });
    }

    return span;
}

/**
 * Add an event to the current active span
 */
export function addSpanEvent(name: string, attributes?: Record<string, any>) {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
        currentSpan.addEvent(name, attributes);
    }
}
