'use client';

import { useEffect } from 'react';

export function PWARegister() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
                // Ensure waiting SW activates promptly
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && registration.waiting) {
                            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                });
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    // Refresh so new SW takes control
                    window.location.reload();
                });
            })
            .catch((err) => console.error('SW registration failed', err));
    }, []);

    return null;
}


