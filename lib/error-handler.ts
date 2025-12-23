/**
 * Error handling utility for sanitized error responses
 * Prevents information disclosure while logging full errors server-side
 */

export interface ErrorResponse {
    message: string;
    status: number;
    details?: string; // Only for client errors (4xx), not server errors
}

/**
 * Sanitizes errors for client responses
 * Logs full error details server-side but returns generic messages to clients
 */
export function sanitizeError(error: unknown): ErrorResponse {
    // Log full error server-side for debugging
    if (error instanceof Error) {
        console.error('Error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
    } else if (error instanceof Response) {
        // Better Auth or other Response errors
        console.error('Response error:', error.status, error.statusText);
        return {
            message: getClientFriendlyMessage(error.status),
            status: error.status,
            details: error.status >= 400 && error.status < 500 
                ? getClientFriendlyMessage(error.status)
                : undefined
        };
    } else {
        console.error('Unknown error:', error);
    }

    // Return generic message for server errors (5xx)
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


