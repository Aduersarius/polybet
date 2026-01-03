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
                src: '/logo-option5-advanced-10cuts.svg',
                type: 'image/svg+xml',
                sizes: '512x512',
            },
            {
                src: '/logo.png',
                type: 'image/png',
                sizes: '512x512',
            },
            {
                src: '/logo.png',
                type: 'image/png',
                sizes: '192x192',
            },
            {
                src: '/favicon.ico',
                type: 'image/x-icon',
                sizes: '48x48 32x32 16x16',
            },
        ],
    };
}


