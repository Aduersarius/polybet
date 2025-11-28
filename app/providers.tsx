'use client';

import {
    QueryClientProvider,
    QueryClient,
} from "@tanstack/react-query";
import { createAuthClient } from "better-auth/client";

const queryClient = new QueryClient();

const authClient = createAuthClient({
    baseURL: "http://localhost:3000",
});

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
