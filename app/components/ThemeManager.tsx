'use client';

import { useBalance } from "@/hooks/use-balance";
import { useEffect } from "react";

export function ThemeManager() {
    const { data: balanceData } = useBalance();
    const accountMode = balanceData?.accountMode || 'LIVE';

    useEffect(() => {
        // Handle Account Mode (.demo)
        if (accountMode === 'DEMO') {
            document.documentElement.classList.add('demo');
        } else {
            document.documentElement.classList.remove('demo');
        }

        // Handle UI Theme (.light)
        const savedTheme = localStorage.getItem('pariflow-theme') || 'dark';
        if (savedTheme === 'light') {
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
        }

        // Listen for storage changes to sync across tabs
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'pariflow-theme') {
                if (e.newValue === 'light') document.documentElement.classList.add('light');
                else document.documentElement.classList.remove('light');
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [accountMode]);

    return null;
}
