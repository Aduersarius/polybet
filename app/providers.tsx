'use client';

import {
    QueryClientProvider,
    QueryClient,
} from "@tanstack/react-query";
import { SettingsProvider } from "@/lib/settings-context";
import { useClientTelemetry } from "@/hooks/use-client-telemetry";
import { CustomTourProvider } from "@/contexts/CustomTourContext";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    useClientTelemetry();
    return (
        <QueryClientProvider client={queryClient}>
            <SettingsProvider>
        <CustomTourProvider>
          {children}
        </CustomTourProvider>
            </SettingsProvider>
        </QueryClientProvider>
    );
}
