'use client';

import type { NextWebVitalsMetric } from 'next/app';

type WebVitalPayload = NextWebVitalsMetric & {
  dpr?: number;
  viewportWidth?: number;
  connection?: {
    downlink?: number;
    rtt?: number;
    effectiveType?: string;
  };
};

const SAMPLE_RATE = Number(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE || '1');
const shouldSample = () => Math.random() < Math.max(0, Math.min(1, SAMPLE_RATE));

function withClientHints(metric: NextWebVitalsMetric): WebVitalPayload {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : undefined;
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;

  return {
    ...metric,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
    connection: connection
      ? {
          downlink: connection.downlink,
          rtt: connection.rtt,
          effectiveType: connection.effectiveType,
        }
      : undefined,
  };
}

async function sendWebVital(metric: WebVitalPayload) {
  const body = JSON.stringify({
    type: 'perf',
    name: `web-vital:${metric.name.toLowerCase()}`,
    payload: metric,
  });

  // Prefer sendBeacon to avoid blocking navigation; fall back to fetch
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/telemetry', blob);
    return;
  }

  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (err) {
    // Non-blocking; ignore failures (auth, offline, etc.)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[web-vitals] send failed', err);
    }
  }
}

export function reportWebVitals(metric: NextWebVitalsMetric) {
  if (typeof window === 'undefined') return;
  if (!shouldSample()) return;

  const payload = withClientHints(metric);

  if (process.env.NODE_ENV === 'development') {
    console.info('[web-vitals]', metric.name, Math.round(metric.value), payload);
  }

  void sendWebVital(payload);
}


