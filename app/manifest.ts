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
                src: '/diamond_logo_nobg.png',
                type: 'image/png',
                sizes: 'any',
            },
        ],
    };
}


