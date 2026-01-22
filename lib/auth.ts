import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { symmetricDecrypt } from "better-auth/crypto";
import { Resend } from "resend";
import { recordTelemetryEvent, updateUserTelemetry } from "./user-telemetry";
import { logger } from "./logger";
import { trackAuthEvent, trackError } from "./metrics";

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl =
    process.env.BETTER_AUTH_URL
    || (isProduction ? 'https://pariflow.com' : 'http://localhost:3000');

const baseTrustedOrigins = [
    'https://pariflow.com',
    'https://www.pariflow.com',
];

const devTrustedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
];

export const trustedOrigins = (() => {
    const origins = new Set<string>(baseTrustedOrigins);
    const isHttps = baseUrl.startsWith('https://');

    if (!isProduction) {
        devTrustedOrigins.forEach((o) => origins.add(o));
    }

    // Only trust baseUrl in production if it's HTTPS to avoid downgrades via env misconfig
    if (!isProduction || isHttps) {
        origins.add(baseUrl);
    }

    // Trust Vercel deployments
    if (process.env.VERCEL_URL) {
        origins.add(`https://${process.env.VERCEL_URL}`);
    }
    if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        origins.add(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`);
    }
    if (process.env.NEXT_PUBLIC_APP_URL) {
        origins.add(process.env.NEXT_PUBLIC_APP_URL);
    }

    return Array.from(origins);
})();

// Initialize Resend (only if API key is available)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Debug log (dev only) - Lazy logged once
let hasLoggedConfig = false;
function logAuthConfig() {
    if (!isProduction && !hasLoggedConfig) {
        console.log('Auth Config:', {
            isProduction,
            baseUrl,
            hasGoogleCreds: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            hasResend: !!process.env.RESEND_API_KEY,
        });
        hasLoggedConfig = true;
    }
}
logAuthConfig();

// Email template for verification
const LOGO_URL = 'https://jnlgh0ps99hx76my.public.blob.vercel-storage.com/diamond_logo_nobg.png';

const createVerificationEmailHTML = (verificationUrl: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your email - Pariflow</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                    <!-- Logo -->
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <img src="${LOGO_URL}" alt="Pariflow" width="64" height="64" style="display: block;" />
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <span style="font-size: 28px; font-weight: bold; color: #8b5cf6;">Pariflow</span>
                        </td>
                    </tr>
                    <!-- Card -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a1a, #0a0a0a); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 24px; color: #ffffff; text-align: center;">
                                Verify your email
                            </h2>
                            <p style="margin: 0 0 32px; font-size: 16px; color: #9ca3af; text-align: center; line-height: 1.5;">
                                Thanks for signing up! Click the button below to verify your email address and start trading.
                            </p>
                            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td align="center">
                                        <a href="${verificationUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 12px;">
                                            Verify Email
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 32px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                                If you didn't create an account, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding-top: 32px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #4b5563;">
                                © ${new Date().getFullYear()} Pariflow. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

const createPasswordResetEmailHTML = (url: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset your password - Pariflow</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                    <!-- Logo -->
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <img src="${LOGO_URL}" alt="Pariflow" width="64" height="64" style="display: block;" />
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <span style="font-size: 28px; font-weight: bold; color: #8b5cf6;">Pariflow</span>
                        </td>
                    </tr>
                    <!-- Card -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a1a, #0a0a0a); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 24px; color: #ffffff; text-align: center;">
                                Reset your password
                            </h2>
                            <p style="margin: 0 0 32px; font-size: 16px; color: #9ca3af; text-align: center; line-height: 1.5;">
                                We received a request to reset your password. Click the button below to choose a new one.
                            </p>
                            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td align="center">
                                        <a href="${url}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 12px;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 32px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                                If you didn't ask to reset your password, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding-top: 32px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #4b5563;">
                                © ${new Date().getFullYear()} Pariflow. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    baseURL: baseUrl,
    trustedOrigins,
    secret: (() => {
        const secret = process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
        if (!secret) {
            if (isProduction) {
                throw new Error('BETTER_AUTH_SECRET or NEXTAUTH_SECRET must be set in production');
            }
            logger.warn('[AUTH] No auth secret found - using placeholder. Set BETTER_AUTH_SECRET in production.');
            return 'placeholder-secret-change-in-production';
        }
        if (secret.length < 32) {
            throw new Error('Auth secret must be at least 32 characters long');
        }
        return secret;
    })(),
    rateLimit: {
        enabled: true,
        window: 60, // Default: 100 requests per 60 seconds
        max: 100,
        customRules: {
            // Password reset: 3 requests per 15 minutes (900 seconds)
            "/request-password-reset": {
                window: 900,
                max: 3,
            },
            // Email sign-in: 3 requests per 10 seconds (better-auth default, but explicit)
            "/sign-in/email": {
                window: 10,
                max: 3,
            },
        },
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        sendResetPassword: async ({ user, url }) => {
            // Rate limiting is now handled by better-auth's built-in rate limiting
            // configured in the rateLimit.customRules above

            if (!resend) {
                if (isProduction) {
                    throw new Error('Password reset email service is not configured');
                }
                logger.debug(`[EMAIL DEV] Send reset password to ${user.email}`);
                logger.debug(`[EMAIL DEV] Reset Password URL: ${url}`);
                return;
            }

            try {
                await resend.emails.send({
                    from: process.env.RESEND_FROM_EMAIL || 'Pariflow <noreply@pariflow.com>',
                    to: user.email,
                    subject: 'Reset your password - Pariflow',
                    html: createPasswordResetEmailHTML(url),
                });
                logger.info(`[EMAIL] Reset password email sent to ${user.email}`);
            } catch (error) {
                logger.error('[EMAIL] Failed to send reset password email:', error);
                throw error;
            }
        },
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            if (resend) {
                try {
                    await resend.emails.send({
                        from: process.env.RESEND_FROM_EMAIL || 'Pariflow <noreply@pariflow.com>',
                        to: user.email,
                        subject: 'Verify your email - Pariflow',
                        html: createVerificationEmailHTML(url),
                    });
                    logger.info(`[EMAIL] Verification email sent to ${user.email}`);
                } catch (error) {
                    logger.error('[EMAIL] Failed to send verification email:', error);
                    throw error;
                }
            } else {
                // Fallback for development without Resend
                logger.debug(`[EMAIL DEV] Send verification to ${user.email}`);
                logger.debug(`[EMAIL DEV] Verification URL: ${url}`);
            }
        },
        sendOnSignUp: true,
    },
    user: {
        additionalFields: {
            isAdmin: {
                type: "boolean",
                defaultValue: false,
            },
        },
    },
    socialProviders: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
    } : undefined,
    plugins: [
        twoFactor({
            issuer: "Pariflow",
            trustDevice: {
                enabled: true,
                cookieConfig: {
                    maxAge: 60 * 60 * 24 * 30, // 30 days
                }
            }
        }),
        passkey()
    ],
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
        updateAge: 60 * 60 * 24, // Update session every 24 hours
        cookieCache: {
            enabled: true,
            maxAge: 60 * 60 * 24 * 7, // 7 days
        },
    },
    advanced: {
        // Generate secure session tokens
        generateId: () => {
            const crypto = require('crypto');
            return crypto.randomBytes(32).toString('hex');
        },
        // Use secure cookies in production
        cookiePrefix: isProduction ? '__Secure-' : '',
    },
    debug: !isProduction,
    events: {
        session: {
            created: async ({ user }: { user: any }) => {
                // If user doesn't have an image, generate a random gradient one
                // Uses Boring Avatars (gradient type) for a premium, modern look
                if (!user.image) {
                    const seed = user.email || user.id;
                    const colors = ["264653", "2a9d8f", "e9c46a", "f4a261", "e76f51"].join(',');
                    const avatarUrl = `https://source.boringavatars.com/gradient/120/${encodeURIComponent(seed)}?colors=${colors}`;

                    try {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: {
                                image: avatarUrl,
                                avatarUrl: avatarUrl
                            }
                        });
                        logger.info(`[AUTH] Generated gradient avatar for user: ${seed}`);
                        trackAuthEvent('login', 'success', 'email'); // better-auth mostly uses email or social
                    } catch (error) {
                        logger.error(`[AUTH] Failed to auto-generate avatar:`, error);
                        trackError(error, { context: 'auth-avatar-gen' });
                    }
                } else {
                    trackAuthEvent('login', 'success', 'session_refresh');
                }
            }
        }
    }
});

// Utility function to get session from request headers
export async function getSessionFromRequest(request: Request) {
    return await auth.api.getSession({
        headers: request.headers,
    });
}

// Utility function to require authentication in API routes
export async function requireAuth(request: Request) {
    const session = await getSessionFromRequest(request);
    if (!session) {
        console.warn(`[Auth] requireAuth: No session for ${request.url}`);
        throw new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Block access if 2FA is required but not completed
    if ((session.session as any)?.isTwoFactorRequired) {
        console.warn(`[Auth] requireAuth: 2FA required for user ${session.user.id}`);
        throw new Response(JSON.stringify({
            error: 'Authentication failed: Two-factor authentication required',
            code: 'TWO_FACTOR_REQUIRED'
        }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const user = session.user;
    // Enforce ban/deletion checks using authoritative DB state
    const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isBanned: true, isDeleted: true },
    });
    if (!dbUser || dbUser.isBanned || dbUser.isDeleted) {
        recordTelemetryEvent({
            userId: user.id,
            request,
            type: 'security',
            name: 'blocked_account',
            payload: { isBanned: dbUser?.isBanned ?? null, isDeleted: dbUser?.isDeleted ?? null },
        }).catch((err) => logger.error('[telemetry] security event failed', err));
        throw new Response(JSON.stringify({ error: 'Account is disabled' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    updateUserTelemetry(user.id, request).catch((err) =>
        logger.error('[telemetry] update failed (non-blocking)', err)
    );
    return user;
}

// Utility function to require admin authentication in API routes
export async function requireAdminAuth(request: Request) {
    const user = await requireAuth(request);
    if (!user.isAdmin) {
        throw new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return user;
}

// Helper function to verify TOTP code for a specific user
// NOTE: Better Auth encrypts 2FA secrets internally. This function decrypts the secret
// using Better Auth's encryption key and then verifies the TOTP code locally.
export async function verifyUserTotp(userId: string, code: string, _request?: Request): Promise<boolean> {
    try {
        // Sanitize the code
        const sanitizedCode = (code || '').replace(/\s+/g, '').trim();
        if (!sanitizedCode || sanitizedCode.length !== 6 || !/^\d{6}$/.test(sanitizedCode)) {
            return false;
        }

        // Verify user has 2FA enabled and has a TwoFactor record
        const [user, twoFactorRecord] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { twoFactorEnabled: true }
            }),
            prisma.twoFactor.findUnique({
                where: { userId },
                select: { secret: true }
            })
        ]);

        if (!user?.twoFactorEnabled) {
            logger.warn(`[2FA] User ${userId} does not have 2FA enabled`);
            return false;
        }

        if (!twoFactorRecord?.secret) {
            logger.error(`[2FA] CRITICAL: User ${userId} has twoFactorEnabled=true but no TwoFactor record! Data integrity issue.`);
            return false;
        }

        const storedSecret = twoFactorRecord.secret;

        // Check if secret looks like base32 (unencrypted legacy format)
        const isBase32 = /^[A-Z2-7]+=*$/.test(storedSecret.replace(/\s+/g, ''));

        let decryptedSecret: string;

        if (isBase32) {
            // Secret is already in base32 format (unencrypted)
            decryptedSecret = storedSecret;
        } else {
            // Secret is encrypted by Better Auth - decrypt it
            const authSecret = process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
            if (!authSecret) {
                logger.error('[2FA] No auth secret found for decryption');
                return false;
            }

            try {
                decryptedSecret = await symmetricDecrypt({
                    key: authSecret,
                    data: storedSecret
                });
            } catch (decryptError) {
                logger.error('[2FA] Failed to decrypt TOTP secret:', decryptError);
                return false;
            }
        }

        // Now verify the TOTP code using Better Auth's own verification
        // This ensures we use the exact same algorithm as what generated the QR code
        const { createOTP } = await import('@better-auth/utils/otp');
        const isValid = await createOTP(decryptedSecret).verify(sanitizedCode, { window: 1 });
        trackAuthEvent('2fa', isValid ? 'success' : 'failure');
        return isValid;
    } catch (error) {
        trackError(error, { context: '2fa-verify', userId });
        logger.error('[2FA] Error verifying TOTP:', error);
        return false;
    }
}

// Export resend for use in other places (e.g., password reset, notifications)
export { resend };
