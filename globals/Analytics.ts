import { GlobalConfig } from 'payload';

export const Analytics: GlobalConfig = {
    slug: 'analytics',
    access: {
        read: () => true,
    },
    fields: [
        {
            name: 'googleAnalyticsId',
            type: 'text',
            label: 'Google Analytics ID (G-XXXXXXXXXX)',
        },
        {
            name: 'plausibleDomain',
            type: 'text',
            label: 'Plausible Domain',
        },
    ],
};
