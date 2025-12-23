/**
 * Logger utility that respects NODE_ENV and sanitizes sensitive data
 * Replaces console.log/error/warn with production-safe logging
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Patterns to detect and sanitize sensitive data
const SENSITIVE_PATTERNS = [
    /password/gi,
    /secret/gi,
    /token/gi,
    /key/gi,
    /api[_-]?key/gi,
    /auth[_-]?token/gi,
    /session[_-]?token/gi,
    /access[_-]?token/gi,
    /refresh[_-]?token/gi,
    /bearer/gi,
    /authorization/gi,
    /credential/gi,
    /private[_-]?key/gi,
    /mnemonic/gi,
    /seed/gi,
];

/**
 * Sanitizes sensitive data from objects/strings
 */
function sanitizeData(data: any): any {
    if (data === null || data === undefined) {
        return data;
    }

    if (typeof data === 'string') {
        // Check if string contains sensitive patterns
        for (const pattern of SENSITIVE_PATTERNS) {
            if (pattern.test(data)) {
                return '[REDACTED]';
            }
        }
        return data;
    }

    if (typeof data === 'object') {
        if (Array.isArray(data)) {
            return data.map(item => sanitizeData(item));
        }

        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            // Check if key indicates sensitive data
            const isSensitiveKey = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
            
            if (isSensitiveKey) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = sanitizeData(value);
            }
        }
        return sanitized;
    }

    return data;
}

/**
 * Formats log message with sanitization
 */
function formatMessage(level: string, ...args: any[]): any[] {
    if (isProduction) {
        // In production, sanitize all arguments
        return args.map(arg => sanitizeData(arg));
    }
    // In development, log everything
    return args;
}

/**
 * Logger class with different log levels
 */
class Logger {
    /**
     * Log debug messages (only in development)
     */
    debug(...args: any[]): void {
        if (isDevelopment) {
            console.debug('[DEBUG]', ...formatMessage('debug', ...args));
        }
    }

    /**
     * Log info messages (only in development)
     */
    info(...args: any[]): void {
        if (isDevelopment) {
            console.info('[INFO]', ...formatMessage('info', ...args));
        }
    }

    /**
     * Log warnings (always logged, sanitized in production)
     */
    warn(...args: any[]): void {
        console.warn('[WARN]', ...formatMessage('warn', ...args));
    }

    /**
     * Log errors (always logged, sanitized in production)
     */
    error(...args: any[]): void {
        console.error('[ERROR]', ...formatMessage('error', ...args));
    }

    /**
     * Log messages (only in development)
     */
    log(...args: any[]): void {
        if (isDevelopment) {
            console.log('[LOG]', ...formatMessage('log', ...args));
        }
    }
}

// Export singleton instance
export const logger = new Logger();

// Export default for convenience
export default logger;


