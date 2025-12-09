import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction
    ? 'https://polybet.ru'
    : process.env.BETTER_AUTH_URL || 'http://localhost:3000';

// Debug log (remove in production)
console.log('Auth Config:', {
    isProduction,
    baseUrl,
    hasGoogleCreds: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
});

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    baseURL: baseUrl,
    secret: process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET!,
    emailAndPassword: {
        enabled: true,
    },
    user: {
        fields: {
            email: "email",
            name: "name",
            image: "image",
            emailVerified: "emailVerified",
            isAdmin: "isAdmin",
        },
    },
    socialProviders: {
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                authorization: {
                    params: {
                        prompt: "consent",
                        access_type: "offline",
                        response_type: "code"
                    }
                }
            }
        } : {})
    },
    debug: !isProduction, // Enable debug in development
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