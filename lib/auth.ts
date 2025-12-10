import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { twoFactor } from "better-auth/plugins";
import { Resend } from "resend";

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction
    ? 'https://polybet.ru'
    : process.env.BETTER_AUTH_URL || 'http://localhost:3000';

// Initialize Resend (only if API key is available)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Debug log (remove in production)
console.log('Auth Config:', {
    isProduction,
    baseUrl,
    hasGoogleCreds: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    hasResend: !!process.env.RESEND_API_KEY,
});

// Email template for verification
const LOGO_URL = 'https://jnlgh0ps99hx76my.public.blob.vercel-storage.com/diamond_logo_nobg.png';

const createVerificationEmailHTML = (verificationUrl: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your email - PolyBet</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                    <!-- Logo -->
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <img src="${LOGO_URL}" alt="PolyBet" width="64" height="64" style="display: block;" />
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <span style="font-size: 28px; font-weight: bold; color: #8b5cf6;">PolyBet</span>
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
                                © ${new Date().getFullYear()} PolyBet. All rights reserved.
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
    trustedOrigins: [
        'https://polybet.ru',
        'https://www.polybet.ru',
    ],
    secret: process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET!,
    emailAndPassword: {
        enabled: true,
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            if (resend) {
                try {
                    await resend.emails.send({
                        from: process.env.RESEND_FROM_EMAIL || 'PolyBet <noreply@polybet.ru>',
                        to: user.email,
                        subject: 'Verify your email - PolyBet',
                        html: createVerificationEmailHTML(url),
                    });
                    console.log(`[EMAIL] Verification email sent to ${user.email}`);
                } catch (error) {
                    console.error('[EMAIL] Failed to send verification email:', error);
                    throw error;
                }
            } else {
                // Fallback for development without Resend
                console.log(`[EMAIL DEV] Send verification to ${user.email}`);
                console.log(`[EMAIL DEV] Verification URL: ${url}`);
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
            issuer: "PolyBet",
        })
    ],
    debug: !isProduction,
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
        throw new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return session.user;
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

// Export resend for use in other places (e.g., password reset, notifications)
export { resend };
