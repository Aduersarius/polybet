import { z } from 'zod';
import { ethers } from 'ethers';

/**
 * Input validation utilities
 * Provides centralized Zod schemas for API inputs
 */

// --- Base Schemas ---

export const EthAddressSchema = z.string()
    .min(1, 'Address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .refine((addr) => {
        try {
            return ethers.isAddress(addr);
        } catch {
            return false;
        }
    }, { message: 'Invalid address checksum' });

export const EmailSchema = z.string()
    .email('Invalid email format')
    .max(255, 'Email too long');

export const UUIDSchema = z.string()
    .uuid('Invalid UUID format');

export const EventIdSchema = z.string()
    .min(1, 'Event ID is required')
    .max(100)
    .refine((val) => {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const numericPattern = /^\d+$/;
        const cuidPattern = /^[a-z0-9]{20,30}$/i;
        const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i; // Alphanumeric with hyphens
        return uuidPattern.test(val) || numericPattern.test(val) || cuidPattern.test(val) || slugPattern.test(val);
    }, { message: 'Invalid event ID format' });

export const OutcomeIdSchema = EventIdSchema; // Use same validation for Outcome IDs

export const SafeUrlSchema = z.string().url().refine((val) => {
    try {
        const parsed = new URL(val);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        const hostname = parsed.hostname.toLowerCase();
        return !(
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.16.') ||
            hostname.endsWith('.local')
        );
    } catch {
        return false;
    }
}, { message: 'URL cannot point to internal addresses or use unsafe protocols' });

// --- Domain Schemas ---

export const BetRequestSchema = z.object({
    eventId: EventIdSchema,
    option: z.enum(['YES', 'NO', 'yes', 'no', 'Yes', 'No']).transform(v => v.toUpperCase() as 'YES' | 'NO'),
    amount: z.coerce.number().min(0.01).max(1000),
    outcomeId: OutcomeIdSchema.optional(),
}).strict();

export const TradeRequestSchema = z.object({
    eventId: EventIdSchema,
    side: z.enum(['buy', 'sell']),
    amount: z.coerce.number().min(0.01).max(1000),
    option: z.enum(['YES', 'NO', 'yes', 'no', 'Yes', 'No']).optional().transform(v => v?.toUpperCase()),
    outcomeId: OutcomeIdSchema.optional(),
    orderType: z.enum(['market', 'limit']).default('market'),
    price: z.coerce.number().min(0.01).max(1).optional(),
}).strict().refine(data => data.option || data.outcomeId, {
    message: "Either option or outcomeId is required",
    path: ["option"]
});

export const MessageRequestSchema = z.object({
    text: z.string().trim().min(1, 'Message cannot be empty').max(5000, 'Message too long'),
    parentId: UUIDSchema.optional(),
}).strict();

export const UserUpdateSchema = z.object({
    username: z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_\s-]*$/, 'Invalid characters in username').optional(),
    description: z.string().trim().max(500).optional(),
    avatarUrl: SafeUrlSchema.optional().nullable(),
    website: SafeUrlSchema.optional().nullable(),
    twitter: z.string().max(50).regex(/^[a-zA-Z0-9_]{1,15}$/, 'Invalid Twitter handle').optional().nullable(),
    telegram: z.string().max(50).regex(/^[a-zA-Z0-9_]{5,32}$/, 'Invalid Telegram handle').optional().nullable(),
    discord: z.string().max(50).regex(/^.{2,32}#[0-9]{4}$|^[a-zA-Z0-9_.]{2,32}$/, 'Invalid Discord handle').optional().nullable(),
}).strict();

export const HedgeConfigSchema = z.object({
    enabled: z.boolean(),
    minSpreadBps: z.number().min(0).max(5000), // Max 50%
    maxSlippageBps: z.number().min(0).max(1000), // Max 10%
    maxUnhedgedExposure: z.number().min(0),
    maxPositionSize: z.number().min(0),
    hedgeTimeoutMs: z.number().min(1000).max(60000),
    retryAttempts: z.number().min(0).max(10),
    minProfitThreshold: z.number().min(0),
}).strict();

// --- Sanitization Utilities ---

export function sanitizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '')
        .replace(/javascript:/gi, '');
}

export function sanitizeText(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Legacy Validation Result Type
 */
export interface ValidationResult {
    valid: boolean;
    sanitized?: any;
    error?: string;
}

/**
 * Helper to convert Zod result to legacy ValidationResult
 */
function toLegacyResult(result: any): ValidationResult {
    if (!result.success) {
        return {
            valid: false,
            error: result.error.issues[0].message,
        };
    }
    return {
        valid: true,
        sanitized: result.data,
    };
}

// --- Legacy Validation Functions (Backward Compatibility) ---

export function validateString(value: unknown, min: number = 0, max: number = 255): ValidationResult {
    const schema = z.string().min(min).max(max).transform(v => v.trim());
    return toLegacyResult(schema.safeParse(value));
}

export function validateNumber(value: unknown, min?: number, max?: number, integer: boolean = false): ValidationResult {
    if (value === undefined || value === null || value === '') {
        return { valid: true, sanitized: undefined };
    }

    let schema = z.coerce.number({ message: 'Field must be a number' });
    if (integer) schema = schema.int('Field must be an integer');
    if (min !== undefined) schema = schema.min(min, `Field must be at least ${min}`);
    if (max !== undefined) schema = schema.max(max, `Field must be at most ${max}`);

    return toLegacyResult(schema.safeParse(value));
}

export function validateEmail(value: unknown, required: boolean = false): ValidationResult {
    if (!value && !required) return { valid: true, sanitized: undefined };
    return toLegacyResult(EmailSchema.safeParse(value));
}

export function validateEthereumAddress(value: unknown, required: boolean = false): ValidationResult {
    if (!value && !required) return { valid: true, sanitized: undefined };
    return toLegacyResult(EthAddressSchema.safeParse(value));
}

export function validateUUID(value: unknown, required: boolean = false): ValidationResult {
    if (!value && !required) return { valid: true, sanitized: undefined };
    return toLegacyResult(UUIDSchema.safeParse(value));
}

export function validateEventId(value: unknown, required: boolean = false): ValidationResult {
    if (!value && !required) return { valid: true, sanitized: undefined };
    return toLegacyResult(EventIdSchema.safeParse(value));
}

export function validateBoolean(value: unknown): ValidationResult {
    const schema = z.preprocess((val) => {
        if (typeof val === 'string') {
            const lower = val.toLowerCase();
            if (['true', '1', 'yes'].includes(lower)) return true;
            if (['false', '0', 'no'].includes(lower)) return false;
        }
        return val;
    }, z.boolean({ message: 'Field must be a boolean' }));

    return toLegacyResult(schema.safeParse(value));
}

export function validateDate(value: unknown, required: boolean = false): ValidationResult {
    if (!value && !required) return { valid: true, sanitized: undefined };
    const schema = z.coerce.date({ message: 'Field must be a date' });
    return toLegacyResult(schema.safeParse(value));
}
