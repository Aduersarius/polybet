import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Pariflow',
        short_name: 'Pariflow',
        description: 'Trade what you believe on Pariflow.',
        start_url: '/',
        scope: '/',
        id: '/',
        lang: 'en',
        dir: 'ltr',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
            {
                src: '/favicon.ico',
                type: 'image/x-icon',
                sizes: 'any',
            },
            {
                src: '/icon-trans-48.png',
                type: 'image/png',
                sizes: '48x48',
            },
            {
                src: '/icon-trans-96.png',
                type: 'image/png',
                sizes: '96x96',
            },
            {
                src: '/icon-trans-144.png',
                type: 'image/png',
                sizes: '144x144',
            },
            {
                src: '/icon-trans-192.png',
                type: 'image/png',
                sizes: '192x192',
                purpose: 'maskable',
            },
            {
                src: '/icon-trans-512.png',
                type: 'image/png',
                sizes: '512x512',
                purpose: 'maskable',
            },
        ],
    };
}


