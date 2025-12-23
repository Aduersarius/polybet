/**
 * Input validation utilities
 * Provides type-safe validation for API inputs
 */

export interface ValidationResult {
    valid: boolean;
    error?: string;
    sanitized?: any;
}

/**
 * Validates and sanitizes a string input
 */
export function validateString(
    value: unknown,
    options: {
        minLength?: number;
        maxLength?: number;
        required?: boolean;
        pattern?: RegExp;
        trim?: boolean;
    } = {}
): ValidationResult {
    const { minLength = 0, maxLength = 10000, required = false, pattern, trim = true } = options;

    if (value === null || value === undefined) {
        if (required) {
            return { valid: false, error: 'Field is required' };
        }
        return { valid: true, sanitized: '' };
    }

    if (typeof value !== 'string') {
        return { valid: false, error: 'Field must be a string' };
    }

    let sanitized = trim ? value.trim() : value;

    if (sanitized.length < minLength) {
        return { valid: false, error: `Field must be at least ${minLength} characters` };
    }

    if (sanitized.length > maxLength) {
        return { valid: false, error: `Field must be at most ${maxLength} characters` };
    }

    if (pattern && !pattern.test(sanitized)) {
        return { valid: false, error: 'Field format is invalid' };
    }

    return { valid: true, sanitized };
}

/**
 * Validates and sanitizes a number input
 */
export function validateNumber(
    value: unknown,
    options: {
        min?: number;
        max?: number;
        required?: boolean;
        integer?: boolean;
    } = {}
): ValidationResult {
    const { min, max, required = false, integer = false } = options;

    if (value === null || value === undefined) {
        if (required) {
            return { valid: false, error: 'Field is required' };
        }
        return { valid: true, sanitized: undefined };
    }

    // Convert string to number if possible
    let num: number;
    if (typeof value === 'string') {
        num = parseFloat(value);
    } else if (typeof value === 'number') {
        num = value;
    } else {
        return { valid: false, error: 'Field must be a number' };
    }

    // Check for NaN and Infinity
    if (!Number.isFinite(num)) {
        return { valid: false, error: 'Field must be a finite number' };
    }

    // Check integer requirement
    if (integer && !Number.isInteger(num)) {
        return { valid: false, error: 'Field must be an integer' };
    }

    // Check bounds
    if (min !== undefined && num < min) {
        return { valid: false, error: `Field must be at least ${min}` };
    }

    if (max !== undefined && num > max) {
        return { valid: false, error: `Field must be at most ${max}` };
    }

    return { valid: true, sanitized: num };
}

/**
 * Validates an email address
 */
export function validateEmail(value: unknown, required: boolean = false): ValidationResult {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const stringResult = validateString(value, {
        required,
        maxLength: 255,
        pattern: emailPattern,
        trim: true
    });

    if (!stringResult.valid) {
        return stringResult;
    }

    if (stringResult.sanitized && !emailPattern.test(stringResult.sanitized)) {
        return { valid: false, error: 'Invalid email format' };
    }

    return stringResult;
}

/**
 * Validates an Ethereum address
 */
export function validateEthereumAddress(value: unknown, required: boolean = false): ValidationResult {
    const addressPattern = /^0x[a-fA-F0-9]{40}$/;
    const stringResult = validateString(value, {
        required,
        pattern: addressPattern,
        trim: true
    });

    if (!stringResult.valid) {
        return stringResult;
    }

    if (stringResult.sanitized && !addressPattern.test(stringResult.sanitized)) {
        return { valid: false, error: 'Invalid Ethereum address format' };
    }

    return stringResult;
}

/**
 * Validates an array input
 */
export function validateArray<T>(
    value: unknown,
    options: {
        minLength?: number;
        maxLength?: number;
        required?: boolean;
        itemValidator?: (item: unknown) => ValidationResult;
    } = {}
): ValidationResult {
    const { minLength = 0, maxLength = 1000, required = false, itemValidator } = options;

    if (value === null || value === undefined) {
        if (required) {
            return { valid: false, error: 'Field is required' };
        }
        return { valid: true, sanitized: [] };
    }

    if (!Array.isArray(value)) {
        return { valid: false, error: 'Field must be an array' };
    }

    if (value.length < minLength) {
        return { valid: false, error: `Array must have at least ${minLength} items` };
    }

    if (value.length > maxLength) {
        return { valid: false, error: `Array must have at most ${maxLength} items` };
    }

    // Validate items if validator provided
    if (itemValidator) {
        const sanitized: T[] = [];
        for (let i = 0; i < value.length; i++) {
            const itemResult = itemValidator(value[i]);
            if (!itemResult.valid) {
                return { valid: false, error: `Item at index ${i}: ${itemResult.error}` };
            }
            if (itemResult.sanitized !== undefined) {
                sanitized.push(itemResult.sanitized as T);
            }
        }
        return { valid: true, sanitized };
    }

    return { valid: true, sanitized: value };
}

/**
 * Validates an object with schema
 */
export function validateObject(
    value: unknown,
    schema: Record<string, (val: unknown) => ValidationResult>,
    required: boolean = false
): ValidationResult {
    if (value === null || value === undefined) {
        if (required) {
            return { valid: false, error: 'Object is required' };
        }
        return { valid: true, sanitized: {} };
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, error: 'Field must be an object' };
    }

    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(schema)) {
        const result = validator(obj[key]);
        if (!result.valid) {
            return { valid: false, error: `${key}: ${result.error}` };
        }
        if (result.sanitized !== undefined) {
            sanitized[key] = result.sanitized;
        } else if (obj[key] !== undefined) {
            sanitized[key] = obj[key];
        }
    }

    return { valid: true, sanitized };
}

/**
 * Validates a UUID
 */
export function validateUUID(value: unknown, required: boolean = false): ValidationResult {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const stringResult = validateString(value, {
        required,
        pattern: uuidPattern,
        trim: true
    });

    if (!stringResult.valid) {
        return stringResult;
    }

    if (stringResult.sanitized && !uuidPattern.test(stringResult.sanitized)) {
        return { valid: false, error: 'Invalid UUID format' };
    }

    return stringResult;
}

/**
 * Validates a boolean
 */
export function validateBoolean(value: unknown, required: boolean = false): ValidationResult {
    if (value === null || value === undefined) {
        if (required) {
            return { valid: false, error: 'Field is required' };
        }
        return { valid: true, sanitized: false };
    }

    if (typeof value === 'boolean') {
        return { valid: true, sanitized: value };
    }

    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') {
            return { valid: true, sanitized: true };
        }
        if (lower === 'false' || lower === '0' || lower === 'no') {
            return { valid: true, sanitized: false };
        }
    }

    return { valid: false, error: 'Field must be a boolean' };
}

/**
 * Validates a date string or Date object
 */
export function validateDate(value: unknown, required: boolean = false): ValidationResult {
    if (value === null || value === undefined) {
        if (required) {
            return { valid: false, error: 'Field is required' };
        }
        return { valid: true, sanitized: undefined };
    }

    let date: Date;
    if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        date = new Date(value);
    } else {
        return { valid: false, error: 'Field must be a date' };
    }

    if (isNaN(date.getTime())) {
        return { valid: false, error: 'Invalid date' };
    }

    return { valid: true, sanitized: date };
}

/**
 * Sanitizes HTML to prevent XSS
 * Basic implementation - consider using a library like DOMPurify for production
 */
export function sanitizeHtml(html: string): string {
    // Remove script tags and event handlers
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '')
        .replace(/javascript:/gi, '');
}


