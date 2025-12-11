'use client';

import { useEffect } from 'react';

type TelemetryType = 'perf' | 'error' | 'feature' | 'security';

type TelemetryPayload = Record<string, unknown>;

async function sendTelemetry(type: TelemetryType, name: string, payload: TelemetryPayload) {
    try {
        await fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name, payload }),
            keepalive: true,
        });
    } catch (error) {
        console.warn('[telemetry] client send failed', error);
    }
}

function collectClientHints() {
    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    return {
        deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
        dpr: typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : undefined,
        viewportWidth: typeof window.innerWidth === 'number' ? window.innerWidth : undefined,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
        ect: connection?.effectiveType,
    };
}

function collectNavigationTimings() {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!navEntry) return undefined;

    const paintEntries = performance.getEntriesByType('paint') as PerformanceEntry[];
    const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint');

    return {
        type: navEntry.type,
        domContentLoaded: navEntry.domContentLoadedEventEnd,
        loadEventEnd: navEntry.loadEventEnd,
        responseEnd: navEntry.responseEnd,
        fcp: fcp?.startTime,
    };
}

export function useClientTelemetry() {
    useEffect(() => {
        const basePayload = collectClientHints();
        const navTimings = collectNavigationTimings();
        if (navTimings) {
            void sendTelemetry('perf', 'navigation', { ...basePayload, ...navTimings });
        }

        const handleError = (event: ErrorEvent) => {
            const payload = {
                ...basePayload,
                message: event.message,
                source: event.filename,
                line: event.lineno,
                column: event.colno,
                stack: event.error?.stack ? String(event.error.stack).slice(0, 1000) : undefined,
            };
            void sendTelemetry('error', 'js_error', payload);
        };

        const handleRejection = (event: PromiseRejectionEvent) => {
            const payload = {
                ...basePayload,
                reason: typeof event.reason === 'string' ? event.reason.slice(0, 500) : String(event.reason),
            };
            void sendTelemetry('error', 'unhandled_rejection', payload);
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, []);
}
