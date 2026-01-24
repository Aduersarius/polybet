import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import fs from 'fs';

import path from 'path';
import { dbQueryCounter, dbQueryHistogram } from './metrics';

import { env, isProd, isDev } from './env';

// Prisma Client Singleton - v4 (Prisma 7 Adapter Edition)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; pool: Pool; hasLogged: boolean };

function createPrismaClient() {
    if (!isProd && !globalForPrisma.hasLogged) {
        // Log removed to reduce noise
        globalForPrisma.hasLogged = true;
    }

    let dbUrl = env.DATABASE_URL;
    if (dbUrl && !dbUrl.includes('pgbouncer=true')) {
        dbUrl += dbUrl.includes('?') ? '&pgbouncer=true' : '?pgbouncer=true';
    }

    const caPath = path.join(process.cwd(), 'certs', 'db-ca.crt');
    if (!fs.existsSync(caPath)) {
        throw new Error(`[prisma] CRITICAL: CA certificate not found at ${caPath}. Database connection cannot be established securely.`);
    }

    const sslConfig = {
        ca: fs.readFileSync(caPath).toString(),
        rejectUnauthorized: true
    };

    const pool = new Pool({
        connectionString: dbUrl,
        max: isProd ? 10 : 5, // Increased for Next.js 16 Turbopack hot-reloads
        idleTimeoutMillis: 10000, // Faster cleanup in dev
        connectionTimeoutMillis: 5000,
        ssl: sslConfig,
        // Aggressively clean up connections in dev to prevent exhaustion
        ...(isDev && {
            allowExitOnIdle: false,
            maxUses: 7500, // Recycle connections after many queries
        }),
    });

    // Handle pool errors to prevent process crash
    pool.on('error', (err) => {
        console.error('[prisma] Unexpected error on idle client', err);
    });

    const adapter = new PrismaPg(pool);
    const candidate = new PrismaClient({
        adapter,
        log: isProd ? ['error'] : ['error', 'warn'],
    });

    globalForPrisma.pool = pool;
    return candidate;
}

const basePrisma = globalForPrisma.prisma || createPrismaClient();

// Always preserve the singleton if we are in development or if it doesn't exist yet
if (!isProd || !globalForPrisma.prisma) {
    globalForPrisma.prisma = basePrisma;
}

const SESSION_HASH_SECRET = env.SESSION_TOKEN_SECRET || env.BETTER_AUTH_SECRET || '';

// Allow reuse of existing auth secrets if SECURE_DATA_KEY is not set, but still require strong length in production.
const DATA_ENCRYPTION_KEY = env.SECURE_DATA_KEY || env.BETTER_AUTH_SECRET || '';

let warnedAboutEncryptionKey = false;

function getEncryptionKey(): Buffer | null {
    if (!DATA_ENCRYPTION_KEY || DATA_ENCRYPTION_KEY.length < 32) {
        if (!warnedAboutEncryptionKey) {
            console.warn('[prisma] SECURE_DATA_KEY (or fallback) missing or too short (needs 32+ chars); TwoFactor secrets will remain plaintext in non-production.');
            warnedAboutEncryptionKey = true;
        }
        return null;
    }
    return Buffer.from(DATA_ENCRYPTION_KEY.slice(0, 32));
}

function hashSessionToken(token: string): string {
    if (!SESSION_HASH_SECRET) {
        console.warn('[prisma] SESSION_TOKEN_SECRET missing; session tokens stored in plaintext.');
        return token;
    }
    return createHmac('sha256', SESSION_HASH_SECRET).update(token).digest('hex');
}

function encryptField(value: string | null | undefined): string | null | undefined {
    if (!value) return value;
    const key = getEncryptionKey();
    if (!key) return value;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptField(value: string | null | undefined): string | null | undefined {
    if (!value) return value;
    const key = getEncryptionKey();
    if (!key) return value;

    const parts = value.split('.');
    if (parts.length !== 3) return value;

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

// 1. Metrics Extension - wraps all operations
const prismaWithMetrics =
    typeof (basePrisma as any).$extends === 'function'
        ? (basePrisma as any).$extends({
            query: {
                $allModels: {
                    $allOperations: async ({ model, operation, args, query }: any) => {
                        const start = performance.now();
                        try {
                            const result = await query(args);
                            const duration = performance.now() - start;
                            dbQueryCounter.add(1, { model, operation, status: 'success' });
                            dbQueryHistogram.record(duration, { model, operation, status: 'success' });
                            return result;
                        } catch (error) {
                            const duration = performance.now() - start;
                            dbQueryCounter.add(1, { model, operation, status: 'failure' });
                            dbQueryHistogram.record(duration, { model, operation, status: 'failure' });
                            throw error;
                        }
                    },
                },
            },
        })
        : basePrisma;

// 2. Auth Extension - handles session hashing
const prismaWithExtensions =
    typeof (prismaWithMetrics as any).$extends === 'function'
        ? (prismaWithMetrics as any).$extends({
            query: {
                Session: {
                    create: async ({ args, query }: any) => {
                        if (args?.data?.token) args.data.token = hashSessionToken(args.data.token);
                        return query(args);
                    },
                    update: async ({ args, query }: any) => {
                        if (args?.data?.token) args.data.token = hashSessionToken(args.data.token);
                        return query(args);
                    },
                    upsert: async ({ args, query }: any) => {
                        if (args?.create?.token) args.create.token = hashSessionToken(args.create.token);
                        if (args?.update?.token) args.update.token = hashSessionToken(args.update.token);
                        return query(args);
                    },
                    createMany: async ({ args, query }: any) => {
                        if (Array.isArray(args?.data)) {
                            args.data = args.data.map((entry: any) =>
                                entry?.token ? { ...entry, token: hashSessionToken(entry.token) } : entry
                            );
                        } else if (args?.data?.token) {
                            args.data.token = hashSessionToken(args.data.token);
                        }
                        return query(args);
                    },
                    updateMany: async ({ args, query }: any) => {
                        if (args?.data?.token) args.data.token = hashSessionToken(args.data.token);
                        return query(args);
                    },
                },
                // TwoFactor model is managed by Better Auth - it handles encryption internally
            },
        })
        : prismaWithMetrics;

export const prisma = prismaWithExtensions;
