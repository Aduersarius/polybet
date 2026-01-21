import { z } from 'zod';

const envSchema = z.object({
    // Core / Environment
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    VERCEL_URL: z.string().optional(),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    POSTGRES_PRISMA_URL: z.string().optional(),

    // Redis
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    REDIS_ALLOW_SELF_SIGNED: z.string().transform((v) => v === 'true').default(false),

    // Auth & Security
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters in production'),
    SECURE_DATA_KEY: z.string().min(32).optional(),
    SESSION_TOKEN_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    AFFILIATE_JWT_SECRET: z.string().optional(),
    RECOVERY_PRIVATE_KEY: z.string().optional(),

    // Polymarket (CLOB)
    POLYMARKET_API_KEY: z.string().optional(),
    POLYMARKET_API_SECRET: z.string().optional(),
    POLYMARKET_PASSPHRASE: z.string().optional(),
    POLYMARKET_CHAIN_ID: z.coerce.number().default(137),
    POLYMARKET_CREATOR_ID: z.string().optional(),
    POLYMARKET_CLOB_API_URL: z.string().url().default('https://clob-api-gcp.polymarket.com'),

    // External Services
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    TELEGRAM_WEBHOOK_URL: z.string().url().optional(),

    // Analytics & Sentry (if used)
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

/**
 * Validated environment variables
 */
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Invalid environment variables:', _env.error.format());
    throw new Error('Invalid environment variables');
}

export const env = _env.data;

// Export individual keys for easy access if needed (optional)
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
