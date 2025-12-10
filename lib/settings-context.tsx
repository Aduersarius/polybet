'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from '@/lib/auth-client';

export interface UserSettings {
    trading: {
        confirmOrders: boolean;
        quickBetAmounts: number[];
        autoRefreshOdds: boolean;
        refreshInterval: number;
    };
    notifications: {
        priceAlerts: boolean;
        positionUpdates: boolean;
        eventResolution: boolean;
        emailNotifications: boolean;
    };
    display: {
        currency: string;
        timezone: string;
        oddsFormat: string;
    };
    privacy: {
        publicProfile: boolean;
        showActivity: boolean;
    };
}

const defaultSettings: UserSettings = {
    trading: {
        confirmOrders: true,
        quickBetAmounts: [5, 10, 25, 50, 100],
        autoRefreshOdds: true,
        refreshInterval: 5,
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
        oddsFormat: 'probability',
    },
    privacy: {
        publicProfile: true,
        showActivity: true,
    },
};

interface SettingsContextType {
    settings: UserSettings;
    isLoading: boolean;
    updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
    formatCurrency: (amount: number) => string;
    formatOdds: (probability: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const { data: session } = useSession();
    const user = (session as any)?.user;
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch settings when user is available
    useEffect(() => {
        if (user) {
            fetch('/api/user/settings')
                .then(res => res.json())
                .then(data => {
                    setSettings({
                        trading: { ...defaultSettings.trading, ...data?.trading },
                        notifications: { ...defaultSettings.notifications, ...data?.notifications },
                        display: { ...defaultSettings.display, ...data?.display },
                        privacy: { ...defaultSettings.privacy, ...data?.privacy },
                    });
                    setIsLoading(false);
                })
                .catch(() => {
                    setIsLoading(false);
                });
        } else {
            setIsLoading(false);
        }
    }, [user]);

    const updateSettings = async (updates: Partial<UserSettings>) => {
        const newSettings = {
            ...settings,
            ...updates,
        };
        setSettings(newSettings);

        if (user) {
            await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings),
            });
        }
    };

    // Currency formatting
    const formatCurrency = (amount: number): string => {
        const currency = settings.display.currency;
        const symbols: Record<string, string> = {
            USD: '$',
            RUB: '₽',
            EUR: '€',
        };
        const symbol = symbols[currency] || '$';

        // Format with proper separators
        const formatted = amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        if (currency === 'RUB') {
            return `${formatted} ${symbol}`;
        }
        return `${symbol}${formatted}`;
    };

    // Odds formatting
    const formatOdds = (probability: number): string => {
        const format = settings.display.oddsFormat;

        // Clamp probability between 0.01 and 0.99
        const p = Math.max(0.01, Math.min(0.99, probability));

        switch (format) {
            case 'decimal':
                // Decimal odds = 1 / probability
                const decimal = 1 / p;
                return decimal.toFixed(2);

            case 'fractional':
                // Fractional odds: (1 - p) / p simplified
                const numerator = Math.round((1 - p) * 100);
                const denominator = Math.round(p * 100);
                const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                const divisor = gcd(numerator, denominator);
                if (numerator === 0) return '0/1';
                return `${numerator / divisor}/${denominator / divisor}`;

            case 'probability':
            default:
                return `${Math.round(p * 100)}%`;
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, isLoading, updateSettings, formatCurrency, formatOdds }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        // Return default values if not in provider
        return {
            settings: defaultSettings,
            isLoading: false,
            updateSettings: async () => { },
            formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
            formatOdds: (probability: number) => `${Math.round(probability * 100)}%`,
        };
    }
    return context;
}
