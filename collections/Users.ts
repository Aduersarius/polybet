import type { CollectionConfig } from 'payload';

export const Users: CollectionConfig = {
    slug: 'payload-users',
    auth: true,
    admin: {
        useAsTitle: 'email',
        defaultColumns: ['email', 'username', 'role', 'isAdmin'],
    },
    access: {
        read: () => true,
        create: ({ req }) => !!req.user && req.user.role === 'admin',
        update: ({ req, id }) => {
            if (!req.user) return false;
            if (req.user.role === 'admin') return true;
            return req.user.id === id; // Users can update themselves
        },
        delete: ({ req }) => !!req.user && req.user.role === 'admin',
    },
    fields: [
        {
            name: 'email',
            type: 'email',
            required: true,
            unique: true,
        },
        {
            name: 'role',
            type: 'select',
            required: true,
            defaultValue: 'user',
            options: [
                { label: 'Admin', value: 'admin' },
                { label: 'User', value: 'user' },
            ],
        },
        {
            name: 'username',
            type: 'text',
        },
        {
            name: 'description',
            type: 'textarea',
        },
        {
            name: 'avatarUrl',
            type: 'upload',
            relationTo: 'media',
        },
        // Social Links
        {
            name: 'social',
            type: 'group',
            fields: [
                {
                    name: 'twitter',
                    type: 'text',
                },
                {
                    name: 'discord',
                    type: 'text',
                },
                {
                    name: 'telegram',
                    type: 'text',
                },
                {
                    name: 'website',
                    type: 'text',
                },
            ],
        },
        // Admin flags
        {
            name: 'isAdmin',
            type: 'checkbox',
            defaultValue: false,
            access: {
                update: ({ req }) => !!req.user && req.user.role === 'admin',
            },
        },
        {
            name: 'isBanned',
            type: 'checkbox',
            defaultValue: false,
            access: {
                update: ({ req }) => !!req.user && req.user.role === 'admin',
            },
        },
        // Clerk/Prisma IDs
        {
            name: 'clerkId',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'address',
            type: 'text',
            admin: {
                readOnly: true,
            },
        },
        {
            name: 'prismaId',
            type: 'text',
            admin: {
                readOnly: true,
                description: 'Synced Prisma User ID',
            },
        },
    ],
};
