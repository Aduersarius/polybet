'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

export function useBalance() {
    const { data: session } = useSession();
    const userId = (session as any)?.user?.id;

    return useQuery({
        queryKey: ['balance', userId],
        queryFn: async () => {
            const res = await fetch('/api/balance');
            if (!res.ok) throw new Error('Failed to fetch balance');
            return await res.json();
        },
        enabled: !!userId,
        staleTime: 10000, // Balance stays fresh for 10 seconds
        refetchInterval: 30000, // Automatically refresh every 30 seconds
    });
}
