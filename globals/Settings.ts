import { GlobalConfig } from 'payload';

export const Settings: GlobalConfig = {
    slug: 'settings',
    access: {
        read: () => true,
    },
    fields: [
        {
            name: 'siteName',
            type: 'text',
            defaultValue: 'PolyBet',
        },
        {
            name: 'siteDescription',
            type: 'textarea',
            defaultValue: 'The future of prediction markets.',
        },
        {
            name: 'maintenanceMode',
            type: 'checkbox',
            label: 'Maintenance Mode',
            defaultValue: false,
        },
        {
            name: 'announcement',
            type: 'group',
            fields: [
                {
                    name: 'enabled',
                    type: 'checkbox',
                    defaultValue: false,
                },
                {
                    name: 'message',
                    type: 'text',
                },
                {
                    name: 'link',
                    type: 'text',
                },
            ],
        },
    ],
};
