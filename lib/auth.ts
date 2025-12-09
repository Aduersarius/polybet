import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
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
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
        apple: {
            clientId: process.env.APPLE_CLIENT_ID || "",
            clientSecret: process.env.APPLE_CLIENT_SECRET || "",
        },
    },
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