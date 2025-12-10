import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// Default settings structure
const defaultSettings = {
    trading: {
        confirmOrders: true,
        quickBetAmounts: [5, 10, 25, 50, 100],
        autoRefreshOdds: true,
        refreshInterval: 5, // seconds
    },
    notifications: {
        priceAlerts: true,
        positionUpdates: true,
        eventResolution: true,
        emailNotifications: false,
    },
    display: {
        currency: 'USD',
        timezone: 'auto',
        oddsFormat: 'probability', // 'probability' | 'decimal' | 'fractional'
    },
    privacy: {
        publicProfile: true,
        showActivity: true,
    },
};

export async function GET(request: Request) {
    try {
        const user = await requireAuth(request);

        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { settings: true },
        });

        // Merge default settings with user's saved settings
        const userSettings = dbUser?.settings as Record<string, any> || {};
        const mergedSettings = {
            trading: { ...defaultSettings.trading, ...userSettings.trading },
            notifications: { ...defaultSettings.notifications, ...userSettings.notifications },
            display: { ...defaultSettings.display, ...userSettings.display },
            privacy: { ...defaultSettings.privacy, ...userSettings.privacy },
        };

        return NextResponse.json(mergedSettings);
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireAuth(request);
        const updates = await request.json();

        // Get current settings
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { settings: true },
        });

        const currentSettings = dbUser?.settings as Record<string, any> || {};

        // Deep merge updates into current settings
        const newSettings = {
            trading: { ...defaultSettings.trading, ...currentSettings.trading, ...updates.trading },
            notifications: { ...defaultSettings.notifications, ...currentSettings.notifications, ...updates.notifications },
            display: { ...defaultSettings.display, ...currentSettings.display, ...updates.display },
            privacy: { ...defaultSettings.privacy, ...currentSettings.privacy, ...updates.privacy },
        };

        await prisma.user.update({
            where: { id: user.id },
            data: { settings: newSettings },
        });

        return NextResponse.json(newSettings);
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
