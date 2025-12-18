'use client';

import { useEffect } from 'react';

export function DevSwCleanup() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        if (typeof window === 'undefined') return;
        // Unregister all service workers and clear their caches in dev to avoid stale assets
        navigator.serviceWorker?.getRegistrations?.().then((regs) => {
            regs.forEach((reg) => reg.unregister());
        });
        if (typeof caches !== 'undefined') {
            caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
        }
    }, []);

    return null;
}



