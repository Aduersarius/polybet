'use client';

import { useEffect } from 'react';

/**
 * DeferredScripts - Loads non-critical scripts after page hydration
 * 
 * This component defers loading of Pusher, analytics, and other non-essential
 * JavaScript until after the initial page render completes. This prevents
 * these scripts from blocking LCP and FCP.
 * 
 * Loads after:
 * - Window load event (all resources downloaded)
 * - 1 second delay (ensures user can interact first)
 */
export function DeferredScripts() {
    useEffect(() => {
        // Wait for page to be fully loaded
        const loadDeferredScripts = () => {
            // Add any deferred script initialization here
            // For now, this is a placeholder for future analytics/tracking
            console.log('[DeferredScripts] Non-critical scripts loaded after hydration');
        };

        // Defer until after load event + 1 second
        if (document.readyState === 'complete') {
            setTimeout(loadDeferredScripts, 1000);
        } else {
            window.addEventListener('load', () => {
                setTimeout(loadDeferredScripts, 1000);
            });
        }
    }, []);

    return null; // This component doesn't render anything
}
