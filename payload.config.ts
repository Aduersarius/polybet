import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { fileURLToPath } from 'url';
import { Events } from './collections/Events';
import { Users } from './collections/Users';
import { Media } from './collections/Media';

import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob';
import { Settings } from './globals/Settings';
import { Analytics } from './globals/Analytics';

const dirname = path.resolve();

export default buildConfig({
    admin: {
        user: 'payload-users',
        meta: {
            titleSuffix: '- PolyBet Admin',
        },
    },
    collections: [
        Users,
        Events,
        Media,
    ],
    globals: [
        Settings,
        Analytics,
    ],
    plugins: [
        vercelBlobStorage({
            enabled: true, // Optional, defaults to true
            // Specify which collections should use Vercel Blob
            collections: {
                media: true,
            },
            // Token is automatically read from process.env.BLOB_READ_WRITE_TOKEN
            token: process.env.BLOB_READ_WRITE_TOKEN,
        }),
    ],
    editor: lexicalEditor({}),
    secret: process.env.PAYLOAD_SECRET || 'your-secret-key-here',
    typescript: {
        outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: postgresAdapter({
        pool: {
            connectionString: process.env.DATABASE_URL,
        },
        push: process.env.NODE_ENV === 'production', // Enable in production, disable locally
    }),
    cors: [
        process.env.NEXTAUTH_URL || '',
        'http://localhost:3000',
    ].filter(Boolean),
    csrf: [
        process.env.NEXTAUTH_URL || '',
        'http://localhost:3000',
    ].filter(Boolean),
});
