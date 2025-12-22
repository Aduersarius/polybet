/**
 * Password validation utility with security requirements:
 * - Minimum 12 characters
 * - Must contain: lowercase, uppercase, number, symbol
 * - Must not be a common password
 */

// Top 100 most common passwords (subset for performance)
// In production, consider using a more comprehensive list or external service
const COMMON_PASSWORDS = new Set([
    'password', '123456', '123456789', '12345678', '12345', '1234567',
    '1234567890', 'qwerty', 'abc123', '111111', '123123', 'admin',
    'letmein', 'welcome', 'monkey', '12345678910', 'password1', 'qwerty123',
    '123456789a', '123456a', 'password123', '1234567890a', 'qwertyuiop',
    '12345678901', '123456789012', '1234567890123', '12345678901234',
    'qwerty123456', 'password12', 'password1234', 'password12345',
    '123456789012345', 'qwertyuiop123', 'admin123', 'root123',
    'test123', 'demo123', 'guest123', 'user123', 'pass123', 'pass1234',
    'welcome123', 'hello123', 'welcome1', 'welcome12', 'welcome123',
    'changeme', 'changeme123', 'default', 'default123', 'temp123',
    'temporary', 'temporary123', 'newpassword', 'newpassword123',
    'oldpassword', 'oldpassword123', 'secret', 'secret123', 'private',
    'private123', 'public123', 'access123', 'login123', 'signin123',
    'signup123', 'register123', 'account123', 'profile123', 'settings123',
    'config123', 'setup123', 'install123', 'system123', 'server123',
    'database123', 'mysql123', 'postgres123', 'mongodb123', 'redis123',
    'apache123', 'nginx123', 'docker123', 'kubernetes123', 'aws123',
    'azure123', 'gcp123', 'heroku123', 'vercel123', 'netlify123',
    'github123', 'gitlab123', 'bitbucket123', 'jira123', 'confluence123',
    'slack123', 'discord123', 'telegram123', 'whatsapp123', 'signal123',
]);

export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validates a password against security requirements
 * @param password - The password to validate
 * @returns Validation result with errors array
 */
export function validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password) {
        return { valid: false, errors: ['Password is required'] };
    }

    // Minimum length: 12 characters
    if (password.length < 12) {
        errors.push('Password must be at least 12 characters long');
    }

    // Must contain lowercase letter
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    // Must contain uppercase letter
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    // Must contain number
    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    // Must contain symbol (special character)
    if (!/[^A-Za-z0-9]/.test(password)) {
        errors.push('Password must contain at least one symbol (special character)');
    }

    // Check against common passwords (case-insensitive)
    const passwordLower = password.toLowerCase();
    if (COMMON_PASSWORDS.has(passwordLower)) {
        errors.push('Password is too common. Please choose a more unique password');
    }

    // Check for common patterns
    if (isCommonPattern(password)) {
        errors.push('Password follows a common pattern. Please choose a more unique password');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Checks if password follows common patterns
 */
function isCommonPattern(password: string): boolean {
    const lower = password.toLowerCase();

    // Sequential patterns (e.g., abc123, 123abc, qwerty)
    const sequentialPatterns = [
        /abc(d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z)?\d+/i,
        /\d+abc/i,
        /qwerty/i,
        /asdfgh/i,
        /zxcvbn/i,
    ];

    if (sequentialPatterns.some(pattern => pattern.test(lower))) {
        return true;
    }

    // Repeated characters (e.g., aaaaaa, 111111)
    if (/(.)\1{4,}/.test(password)) {
        return true;
    }

    // Simple keyboard patterns
    const keyboardPatterns = [
        'qwerty', 'asdfgh', 'zxcvbn', '123456', '654321',
        'qazwsx', 'wsxedc', 'rfvtgb', 'tgbyhn', 'yhnujm',
    ];

    if (keyboardPatterns.some(pattern => lower.includes(pattern))) {
        return true;
    }

    return false;
}

/**
 * Gets a user-friendly error message summarizing all validation errors
 */
export function getPasswordErrorMessage(errors: string[]): string {
    if (errors.length === 0) {
        return '';
    }
    if (errors.length === 1) {
        return errors[0];
    }
    return `Password requirements: ${errors.join(', ')}`;
}

