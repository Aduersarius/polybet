import type { CollectionConfig } from 'payload';
import { syncEventToPrisma } from '../hooks/syncEventToPrisma';

export const Events: CollectionConfig = {
    slug: 'payload-events',
    admin: {
        useAsTitle: 'title',
        defaultColumns: ['title', 'status', 'categories', 'resolutionDate'],
    },
    access: {
        read: () => true, // Public read
        create: ({ req }) => !!req.user && req.user.role === 'admin',
        update: ({ req }) => !!req.user && req.user.role === 'admin',
        delete: ({ req }) => !!req.user && req.user.role === 'admin',
    },
    fields: [
        {
            name: 'title',
            type: 'text',
            required: true,
        },
        {
            name: 'description',
            type: 'richText',
            required: true,
        },
        {
            name: 'categories',
            type: 'select',
            hasMany: true,
            options: [
                { label: 'Crypto', value: 'CRYPTO' },
                { label: 'Sports', value: 'SPORTS' },
                { label: 'Politics', value: 'POLITICS' },
                { label: 'Economics', value: 'ECONOMICS' },
                { label: 'Tech', value: 'TECH' },
                { label: 'Other', value: 'OTHER' },
            ],
        },
        {
            name: 'imageUrl',
            type: 'upload',
            relationTo: 'media',
        },
        {
            name: 'resolutionDate',
            type: 'date',
            required: true,
            admin: {
                date: {
                    pickerAppearance: 'dayAndTime',
                },
            },
        },
        {
            name: 'status',
            type: 'select',
            defaultValue: 'ACTIVE',
            options: [
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Resolved', value: 'RESOLVED' },
                { label: 'Cancelled', value: 'CANCELLED' },
            ],
        },
        {
            name: 'result',
            type: 'select',
            options: [
                { label: 'Yes', value: 'YES' },
                { label: 'No', value: 'NO' },
            ],
            admin: {
                condition: (data) => data.status === 'RESOLVED',
            },
        },
        {
            name: 'isHidden',
            type: 'checkbox',
            defaultValue: false,
        },
        {
            name: 'rules',
            type: 'textarea',
        },
        // AMM Parameters
        {
            name: 'amm',
            type: 'group',
            fields: [
                {
                    name: 'liquidityParameter',
                    type: 'number',
                    defaultValue: 100,
                    admin: {
                        description: 'LMSR b parameter',
                    },
                },
                {
                    name: 'initialLiquidity',
                    type: 'number',
                    defaultValue: 100,
                },
            ],
        },
        // Prisma sync ID
        {
            name: 'prismaId',
            type: 'text',
            admin: {
                readOnly: true,
                description: 'Synced Prisma Event ID',
            },
        },
    ],
    hooks: {
        afterChange: [syncEventToPrisma],
    },
    versions: {
        drafts: true,
    },
};
