'use client';

import {
    QueryClientProvider,
    QueryClient,
} from "@tanstack/react-query";
import { SettingsProvider } from "@/lib/settings-context";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <SettingsProvider>
                {children}
            </SettingsProvider>
        </QueryClientProvider>
    );
}
