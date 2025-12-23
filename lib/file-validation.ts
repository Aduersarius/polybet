/**
 * File validation utilities for upload security
 * Includes magic byte validation, filename sanitization, and file type checking
 */

// Magic bytes (file signatures) for common image formats
const MAGIC_BYTES: Record<string, number[][]> = {
    'image/jpeg': [
        [0xFF, 0xD8, 0xFF], // JPEG
    ],
    'image/png': [
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
    ],
    'image/gif': [
        [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
        [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    ],
    'image/webp': [
        [0x52, 0x49, 0x46, 0x46], // RIFF (WebP starts with RIFF)
    ],
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export interface FileValidationResult {
    valid: boolean;
    error?: string;
    sanitizedFilename?: string;
}

/**
 * Validates file type using magic bytes (file signature)
 */
async function validateMagicBytes(file: File, expectedMimeType: string): Promise<boolean> {
    const magicBytes = MAGIC_BYTES[expectedMimeType];
    if (!magicBytes) {
        return false;
    }

    try {
        // Read first bytes of file
        const arrayBuffer = await file.slice(0, 16).arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Check against all possible magic byte patterns for this MIME type
        for (const pattern of magicBytes) {
            let matches = true;
            for (let i = 0; i < pattern.length; i++) {
                if (bytes[i] !== pattern[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return true;
            }
        }

        // Special case for WebP: check for "WEBP" at offset 8
        if (expectedMimeType === 'image/webp' && bytes.length >= 12) {
            const webpSignature = String.fromCharCode(...bytes.slice(8, 12));
            if (webpSignature === 'WEBP') {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error validating magic bytes:', error);
        return false;
    }
}

/**
 * Sanitizes filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
    // Remove path components
    let sanitized = filename.split('/').pop()?.split('\\').pop() || filename;
    
    // Remove leading dots and spaces
    sanitized = sanitized.replace(/^[.\s]+/, '');
    
    // Remove or replace dangerous characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Limit length
    if (sanitized.length > 100) {
        const ext = sanitized.substring(sanitized.lastIndexOf('.'));
        sanitized = sanitized.substring(0, 100 - ext.length) + ext;
    }
    
    // Ensure it doesn't start or end with special characters
    sanitized = sanitized.replace(/^[._-]+|[._-]+$/g, '');
    
    // If empty after sanitization, use a default name
    if (!sanitized || sanitized.trim().length === 0) {
        sanitized = 'file';
    }
    
    return sanitized;
}

/**
 * Validates file extension
 */
function validateExtension(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Comprehensive file validation
 * Checks MIME type, magic bytes, extension, and size
 */
export async function validateFile(
    file: File,
    maxSizeBytes: number = 5 * 1024 * 1024 // 5MB default
): Promise<FileValidationResult> {
    // Check file size
    if (file.size > maxSizeBytes) {
        return {
            valid: false,
            error: `File size exceeds maximum allowed size of ${Math.round(maxSizeBytes / 1024 / 1024)}MB`
        };
    }

    if (file.size === 0) {
        return {
            valid: false,
            error: 'File is empty'
        };
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
            valid: false,
            error: 'File type not allowed. Only JPEG, PNG, GIF, and WebP images are supported'
        };
    }

    // Validate magic bytes (file signature)
    const magicBytesValid = await validateMagicBytes(file, file.type);
    if (!magicBytesValid) {
        return {
            valid: false,
            error: 'File content does not match declared file type'
        };
    }

    // Validate file extension
    if (!validateExtension(file.name)) {
        return {
            valid: false,
            error: 'File extension not allowed'
        };
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.name);

    return {
        valid: true,
        sanitizedFilename
    };
}

/**
 * Gets file extension from filename
 */
export function getFileExtension(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.'));
    return ext.toLowerCase() || '.jpg'; // Default to .jpg if no extension
}


