import type { CollectionConfig } from 'payload';
import { syncAppUserToPrisma } from '../hooks/syncAppUserToPrisma';

export const AppUsers: CollectionConfig = {
    slug: 'app-users',
    admin: {
        useAsTitle: 'email',
        defaultColumns: ['email', 'username', 'isAdmin', 'isBanned', 'createdAt'],
        description: 'Read-only view of application users managed by BetterAuth',
    },
    access: {
        // Only admins can view app users
        read: ({ req }) => !!req.user && req.user.role === 'admin',
        // No one can create/update/delete via Payload (read-only)
        create: () => false,
        update: () => false,
        delete: () => false,
    },
    hooks: {
        afterChange: [syncAppUserToPrisma],
    },
    fields: [
        {
            name: 'prismaId',
            type: 'text',
            required: true,
            unique: true,
            admin: {
                readOnly: true,
                description: 'User ID from Prisma database',
            },
        },
        {
            name: 'email',
            type: 'email',
            required: true,
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'username',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'name',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'description',
            type: 'textarea',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'isAdmin',
            type: 'checkbox',
            defaultValue: false,
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'isBanned',
            type: 'checkbox',
            defaultValue: false,
            admin: {
                description: 'Admin-controlled ban status',
                readOnly: false, // Allow admins to ban users
            },
        },
        {
            name: 'address',
            type: 'text',
            admin: {
                readOnly: true,
                description: 'Wallet address (if applicable)',
            },
        },
        {
            name: 'twitter',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'discord',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'telegram',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'website',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'createdAt',
            type: 'date',
            admin: {
                readOnly: true,
            },
        },
    ],
};
