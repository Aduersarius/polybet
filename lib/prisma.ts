import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

// Ensure engine type always uses the library engine for middleware support.
process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library';

// Prisma Client Singleton - v3 (force reload for new models)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const isProd = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProd ? { rejectUnauthorized: true } : undefined,
    max: isProd ? 20 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

function createPrismaClient() {
    // Prefer the pg adapter pool, but fall back to default client if middleware is unavailable.
    const candidate = new PrismaClient({
        log: isProd ? ['error'] : ['query', 'error', 'warn'],
        adapter: new PrismaPg(pool),
    });
    return candidate;
}

const basePrisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

const SESSION_HASH_SECRET = (() => {
    const secret =
        process.env.SESSION_TOKEN_SECRET ||
        process.env.BETTER_AUTH_SECRET ||
        process.env.NEXTAUTH_SECRET ||
        '';
    if (isProd && !secret) {
        throw new Error('SESSION_TOKEN_SECRET (or BETTER_AUTH_SECRET/NEXTAUTH_SECRET) is required in production for session hashing');
    }
    return secret;
})();

// Allow reuse of existing auth secrets if SECURE_DATA_KEY is not set, but still require strong length in production.
const DATA_ENCRYPTION_KEY = (() => {
    const key =
        process.env.SECURE_DATA_KEY ||
        process.env.BETTER_AUTH_SECRET ||
        process.env.NEXTAUTH_SECRET ||
        '';
    if (isProd && key.length < 32) {
        throw new Error('SECURE_DATA_KEY (or BETTER_AUTH_SECRET/NEXTAUTH_SECRET) must be at least 32 characters in production');
    }
    return key;
})();

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

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

// Prisma extensions to hash session tokens and encrypt/decrypt TwoFactor secrets.
const prismaWithExtensions =
    typeof (basePrisma as any).$extends === 'function'
        ? (basePrisma as any).$extends({
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
                TwoFactor: {
                    create: async ({ args, query }: any) => {
                        if (args?.data) {
                            args.data.secret = encryptField(args.data.secret);
                            args.data.backupCodes = encryptField(args.data.backupCodes);
                        }
                        const result = await query(args);
                        return result
                            ? { ...result, secret: decryptField(result.secret), backupCodes: decryptField(result.backupCodes) }
                            : result;
                    },
                    update: async ({ args, query }: any) => {
                        if (args?.data) {
                            if (args.data.secret) args.data.secret = encryptField(args.data.secret);
                            if (args.data.backupCodes) args.data.backupCodes = encryptField(args.data.backupCodes);
                        }
                        const result = await query(args);
                        return result
                            ? { ...result, secret: decryptField(result.secret), backupCodes: decryptField(result.backupCodes) }
                            : result;
                    },
                    upsert: async ({ args, query }: any) => {
                        if (args?.create) {
                            args.create.secret = encryptField(args.create.secret);
                            args.create.backupCodes = encryptField(args.create.backupCodes);
                        }
                        if (args?.update) {
                            if (args.update.secret) args.update.secret = encryptField(args.update.secret);
                            if (args.update.backupCodes) args.update.backupCodes = encryptField(args.update.backupCodes);
                        }
                        const result = await query(args);
                        return result
                            ? { ...result, secret: decryptField(result.secret), backupCodes: decryptField(result.backupCodes) }
                            : result;
                    },
                    createMany: async ({ args, query }: any) => {
                        if (Array.isArray(args?.data)) {
                            args.data = args.data.map((entry: any) => ({
                                ...entry,
                                secret: encryptField(entry.secret),
                                backupCodes: encryptField(entry.backupCodes),
                            }));
                        } else if (args?.data) {
                            args.data.secret = encryptField(args.data.secret);
                            args.data.backupCodes = encryptField(args.data.backupCodes);
                        }
                        const result = await query(args);
                        return Array.isArray(result)
                            ? result.map((item) => ({
                                ...item,
                                secret: decryptField(item.secret),
                                backupCodes: decryptField(item.backupCodes),
                            }))
                            : result;
                    },
                    updateMany: async ({ args, query }: any) => {
                        if (args?.data) {
                            if (args.data.secret) args.data.secret = encryptField(args.data.secret);
                            if (args.data.backupCodes) args.data.backupCodes = encryptField(args.data.backupCodes);
                        }
                        const result = await query(args);
                        if (!result) return result;
                        if (Array.isArray(result)) {
                            return result.map((item) => ({
                                ...item,
                                secret: decryptField(item.secret),
                                backupCodes: decryptField(item.backupCodes),
                            }));
                        }
                        if (typeof result === 'object') {
                            return {
                                ...result,
                                secret: decryptField((result as any).secret),
                                backupCodes: decryptField((result as any).backupCodes),
                            };
                        }
                        return result;
                    },
                    findUnique: async ({ args, query }: any) => {
                        const result = await query(args);
                        return result
                            ? { ...result, secret: decryptField(result.secret), backupCodes: decryptField(result.backupCodes) }
                            : result;
                    },
                    findFirst: async ({ args, query }: any) => {
                        const result = await query(args);
                        return result
                            ? { ...result, secret: decryptField(result.secret), backupCodes: decryptField(result.backupCodes) }
                            : result;
                    },
                    findMany: async ({ args, query }: any) => {
                        const result = await query(args);
                        return Array.isArray(result)
                            ? result.map((item) => ({
                                ...item,
                                secret: decryptField(item.secret),
                                backupCodes: decryptField(item.backupCodes),
                            }))
                            : result;
                    },
                },
            },
        })
        : basePrisma;

export const prisma = prismaWithExtensions;
