import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import path from 'path';
import { fileURLToPath } from 'url';
import { Events } from './collections/Events';
import { Users } from './collections/Users';
import { Media } from './collections/Media';
import { AppUsers } from './collections/AppUsers';

import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob';
import { Settings } from './globals/Settings';
import { Analytics } from './globals/Analytics';

const dirname = path.resolve();

const config = buildConfig({
    admin: {
        user: 'payload-users',
        meta: {
            titleSuffix: '- PolyBet Admin',
        },
    },
    collections: [
        Users,
        AppUsers,
        Events,
        Media,
    ],
    globals: [
        Settings,
        Analytics,
    ],
    plugins: [
        ...(process.env.BLOB_READ_WRITE_TOKEN ? [vercelBlobStorage({
            enabled: true, // Optional, defaults to true
            // Specify which collections should use Vercel Blob
            collections: {
                media: true,
            },
            // Token is automatically read from process.env.BLOB_READ_WRITE_TOKEN
            token: process.env.BLOB_READ_WRITE_TOKEN,
        })] : []),
    ],
    secret: process.env.PAYLOAD_SECRET || 'your-secret-key-here',
    typescript: {
        outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: postgresAdapter({
        pool: {
            connectionString: process.env.DATABASE_URL,
        },
        push: false, // Disable push to avoid hanging during build
    }),
    // cors: [
    //     process.env.NEXTAUTH_URL || '',
    //     'http://localhost:3000',
    // ].filter(Boolean),
    // csrf: [
    //     process.env.NEXTAUTH_URL || '',
    //     'http://localhost:3000',
    // ].filter(Boolean),
});

console.log('Payload config built successfully:', !!config);
console.log('Payload config type:', typeof config);
if (!config) {
    console.error('Payload config is falsy - check environment variables and configuration');
}

export default config;
