/**
 * Secure logging utilities to prevent log forging (CWE-134)
 * 
 * These helpers sanitize user-controlled input before logging to prevent
 * injection attacks via log messages.
 */

/**
 * Sanitize a string for safe logging by escaping control characters
 * that could be used for log forging attacks.
 */
export function sanitizeForLog(input: unknown): string {
    if (input === null || input === undefined) {
        return String(input);
    }

    const str = String(input);

    // Remove or escape characters that could be used for log injection:
    // - Newlines (\n, \r) could break log parsing
    // - ANSI escape codes could manipulate terminal output
    // - Control characters could corrupt logs
    return str
        .replace(/\r?\n/g, '\\n')  // Escape newlines
        .replace(/\r/g, '\\r')      // Escape carriage returns
        .replace(/\t/g, '\\t')      // Escape tabs
        .replace(/\x1b/g, '')       // Remove ANSI escape sequences
        .replace(/[\x00-\x1F\x7F]/g, ''); // Remove other control characters
}

/**
 * Format a structured log message with sanitized dynamic values
 * 
 * Usage:
 *   console.log(logMessage('[API] Operation failed', { userId, error: err.message }));
 */
export function logMessage(message: string, data?: Record<string, unknown>): string {
    if (!data || Object.keys(data).length === 0) {
        return message;
    }

    const sanitizedData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
        sanitizedData[key] = sanitizeForLog(value);
    }

    return `${message} ${JSON.stringify(sanitizedData)}`;
}

/**
 * Structured logging helpers that use JSON serialization instead of template literals
 */
export const secureLog = {
    info(message: string, data?: Record<string, unknown>): void {
        if (data) {
            console.log(message, JSON.stringify(data));
        } else {
            console.log(message);
        }
    },

    warn(message: string, data?: Record<string, unknown>): void {
        if (data) {
            console.warn(message, JSON.stringify(data));
        } else {
            console.warn(message);
        }
    },

    error(message: string, error?: unknown, data?: Record<string, unknown>): void {
        const errorData = error instanceof Error
            ? { message: sanitizeForLog(error.message), stack: error.stack }
            : { error: sanitizeForLog(error) };

        const combinedData = data ? { ...errorData, ...data } : errorData;
        console.error(message, JSON.stringify(combinedData));
    },
};
