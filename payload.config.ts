import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { fileURLToPath } from 'url';
import { Events } from './collections/Events';
import { Users } from './collections/Users';
import { Media } from './collections/Media';

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
        // Globals will be imported here
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
        push: false,
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
