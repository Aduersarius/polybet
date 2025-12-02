/**
 * Type definitions for Better Auth session objects
 * Based on the User model from prisma schema and Better Auth structure
 */

export interface User {
    id: string;
    address?: string | null;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    emailVerified?: boolean | null;
    createdAt: Date;
    updatedAt: Date;
    achievements?: string[];
    avatarUrl?: string | null;
    description?: string | null;
    discord?: string | null;
    isAdmin: boolean;
    isBanned: boolean;
    telegram?: string | null;
    twitter?: string | null;
    website?: string | null;
    email?: string | null;
}

export interface Session {
    user?: User | null;
    // Add other session properties as needed
    expires?: string;
    token?: string;
}

export interface AuthSession {
    data?: Session | null;
    isPending: boolean;
}