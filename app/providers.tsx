'use client';

import {
    QueryClientProvider,
    QueryClient,
} from "@tanstack/react-query";
import { SettingsProvider } from "@/lib/settings-context";
import { useClientTelemetry } from "@/hooks/use-client-telemetry";
import { CustomTourProvider } from "@/contexts/CustomTourContext";
import { SupportChatProvider } from "@/contexts/SupportChatContext";
import { SupportChatWidget } from "./components/support/SupportChatWidget";
import { ThemeManager } from "./components/ThemeManager";
import { useEffect } from "react";

const queryClient = new QueryClient();

// Expose queryClient globally for signOut to access
if (typeof window !== 'undefined') {
    (window as any).__REACT_QUERY_CLIENT__ = queryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
    useClientTelemetry();
    return (
        <QueryClientProvider client={queryClient}>
            <SettingsProvider>
                <CustomTourProvider>
                    <SupportChatProvider>
                        <ThemeManager />
                        {children}
                        <SupportChatWidget />
                    </SupportChatProvider>
                </CustomTourProvider>
            </SettingsProvider>
        </QueryClientProvider>
    );
}
