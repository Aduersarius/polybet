import { z } from 'zod';

/**
 * Common Zod schemas for use across API routes
 */

// --- Base Primitives ---

export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(50),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();

export const SearchSchema = z.object({
    search: z.string().max(200).optional().transform(v => v?.trim()),
}).strict();

// --- Institutional Trading Schemas ---

export const OrderSideSchema = z.enum(['buy', 'sell']);
export const OrderTypeSchema = z.enum(['market', 'limit', 'iceberg', 'twap', 'stop']);
export const StopTypeSchema = z.enum(['stop_loss', 'stop_limit']);
export const BinaryOptionSchema = z.enum(['YES', 'NO', 'yes', 'no', 'Yes', 'No']).transform(v => v.toUpperCase() as 'YES' | 'NO');

export const OrderItemSchema = z.object({
    eventId: z.string().min(1, 'eventId is required'),
    side: OrderSideSchema,
    option: BinaryOptionSchema.optional(),
    outcomeId: z.string().uuid().optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    price: z.coerce.number().positive('Price must be greater than 0').optional(),
    orderType: OrderTypeSchema.default('limit'),
    visibleAmount: z.coerce.number().positive().optional(),
    timeWindow: z.coerce.number().int().positive().optional(),
    totalDuration: z.coerce.number().int().positive().optional(),
    stopPrice: z.coerce.number().positive().optional(),
    stopType: StopTypeSchema.optional(),
}).strict().refine(data => {
    // Logic from bulk order validation
    if (data.orderType === 'iceberg' && (!data.visibleAmount || data.visibleAmount >= data.amount)) {
        return false;
    }
    if (data.orderType === 'twap' && (!data.timeWindow || !data.totalDuration)) {
        return false;
    }
    if (data.orderType === 'stop' && (!data.stopPrice || !data.stopType)) {
        return false;
    }
    if (data.orderType === 'limit' && !data.price) {
        return false;
    }
    return true;
}, {
    message: 'Invalid parameters for the selected order type',
});

export const BulkOrderRequestSchema = z.object({
    idempotencyKey: z.string().min(1, 'idempotencyKey is required').max(200),
    orders: z.array(OrderItemSchema).min(1, 'At least one order is required').max(100, 'Maximum 100 orders per batch'),
}).strict();

// --- Admin & Search Schemas ---

export const EventFilterSchema = z.object({
    adminId: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    visibility: z.enum(['all', 'visible', 'hidden', 'public']).optional().default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().max(200).optional().transform(v => v?.trim()),
}).strict();

export const AdminEventActionSchema = z.object({
    eventId: z.string().min(1),
    action: z.enum(['toggleHide', 'resolve', 'delete']),
    value: z.union([z.boolean(), z.string(), z.number()]).optional(), // Can be boolean for hide, or outcome ID for resolve
}).strict();

// --- User Settings Schemas ---

export const UserSettingsSchema = z.object({
    trading: z.object({
        confirmOrders: z.boolean().optional(),
        quickBetAmounts: z.array(z.number().positive()).optional(),
        autoRefreshOdds: z.boolean().optional(),
        refreshInterval: z.number().int().min(1).max(60).optional(),
    }).optional(),
    notifications: z.object({
        priceAlerts: z.boolean().optional(),
        positionUpdates: z.boolean().optional(),
        eventResolution: z.boolean().optional(),
        emailNotifications: z.boolean().optional(),
    }).optional(),
    display: z.object({
        currency: z.string().max(10).optional(),
        timezone: z.string().max(100).optional(),
        oddsFormat: z.enum(['probability', 'decimal', 'fractional']).optional(),
    }).optional(),
    privacy: z.object({
        publicProfile: z.boolean().optional(),
        showActivity: z.boolean().optional(),
    }).optional(),
}).strict();

// --- Telegram Schemas ---

export const TelegramUpdateSchema = z.object({
    update_id: z.number(),
    message: z.object({
        message_id: z.number(),
        date: z.number(),
        from: z.object({
            id: z.number(),
            is_bot: z.boolean().default(false),
            first_name: z.string(),
            last_name: z.string().optional(),
            username: z.string().optional(),
        }).optional(),
        chat: z.object({
            id: z.number(),
            type: z.enum(['private', 'group', 'supergroup', 'channel']),
        }),
        text: z.string().optional(),
    }).optional(),
    callback_query: z.object({
        id: z.string(),
        from: z.object({
            id: z.number(),
            is_bot: z.boolean().default(false),
            first_name: z.string().default('Unknown'),
            username: z.string().optional(),
        }),
        data: z.string().optional(),
    }).optional(),
}).strict();

export const CreateEventSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().min(1, 'Description is required'),
    resolutionDate: z.coerce.date(),
    categories: z.array(z.string()).default([]),
    imageUrl: z.string().url().optional(),
    type: z.enum(['BINARY', 'MULTIPLE']).default('BINARY'),
    outcomes: z.array(z.object({
        name: z.string().min(1),
        probability: z.number().min(0).max(1).optional(),
        liquidity: z.number().optional(),
    })).optional(),
    isHidden: z.boolean().default(false),
}).strict().refine(data => {
    if (data.type === 'MULTIPLE' && (!data.outcomes || data.outcomes.length < 2)) {
        return false;
    }
    return true;
}, {
    message: 'Multiple events require at least two outcomes',
});
