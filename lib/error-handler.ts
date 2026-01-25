/**
 * Error handling utility for sanitized error responses
 * Prevents information disclosure while logging full errors server-side
 */

export interface ErrorResponse {
    message: string;
    status: number;
    details?: string;
    code?: string;
}

/**
 * Custom application error class for predictable error handling
 */
export class AppError extends Error {
    status: number;
    code?: string;
    details?: string;

    constructor(message: string, status: number = 500, code?: string, details?: string) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function sanitizeError(error: unknown): ErrorResponse {
    // 1. Handle custom AppError
    if (error instanceof AppError) {
        return {
            message: error.message,
            status: error.status,
            code: error.code,
            details: error.details
        };
    }

    // 2. Handle thrown Response objects (common in lib/auth.ts)
    if (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number') {
        const status = (error as any).status;
        console.error(`[ErrorHandler] Caught Response-like error: ${status}`);

        return {
            message: getClientFriendlyMessage(status),
            status: status,
            details: status < 500 ? getClientFriendlyMessage(status) : undefined
        };
    }

    // 3. Handle standard Error objects
    if (error instanceof Error) {
        console.error('[ErrorHandler] Caught Error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        // Don't leak internal error messages for 500s
        return {
            message: 'Internal Server Error',
            status: 500
        };
    }

    // 4. Handle anything else
    console.error('[ErrorHandler] Caught unknown error:', error);
    return {
        message: 'Internal Server Error',
        status: 500
    };
}

/**
 * Gets client-friendly error messages based on status code
 */
function getClientFriendlyMessage(status: number): string {
    switch (status) {
        case 400:
            return 'Invalid request';
        case 401:
            return 'Authentication required';
        case 403:
            return 'Access denied';
        case 404:
            return 'Resource not found';
        case 409:
            return 'Conflict';
        case 429:
            return 'Too many requests. Please try again later';
        case 500:
            return 'Internal Server Error';
        case 502:
            return 'Service temporarily unavailable';
        case 503:
            return 'Service unavailable. Please try again later';
        default:
            return 'Request failed';
    }
}

/**
 * Creates a NextResponse with sanitized error
 */
export function createErrorResponse(error: unknown, defaultStatus: number = 500): Response {
    const sanitized = sanitizeError(error);
    return Response.json(
        {
            error: sanitized.message,
            ...(sanitized.details && { details: sanitized.details })
        },
        { status: sanitized.status || defaultStatus }
    );
}

/**
 * Creates a NextResponse for known error cases with custom messages
 * Use this for validation errors and other client errors where you want to show specific messages
 */
export function createClientErrorResponse(message: string, status: number = 400): Response {
    return Response.json(
        { error: message },
        { status }
    );
}


