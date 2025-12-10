'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/auth';

type User = {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isAdmin?: boolean;
};

type Session = {
    user: User | null;
    status: 'loading' | 'authenticated' | 'unauthenticated';
};

export function useSession() {
    const [session, setSession] = useState<Session>({
        user: null,
        status: 'loading',
    });

    useEffect(() => {
        async function loadSession() {
            try {
                const session = await auth.api.getSession();
                setSession({
                    user: session?.user || null,
                    status: session?.user ? 'authenticated' : 'unauthenticated',
                });
            } catch (error) {
                console.error('Error loading session:', error);
                setSession({
                    user: null,
                    status: 'unauthenticated',
                });
            }
        }

        loadSession();

        // Set up a listener for auth state changes
        // Note: You'll need to implement this in your auth setup
        // const unsubscribe = auth.onAuthStateChanged((user) => {
        //     setSession({
        //         user,
        //         status: user ? 'authenticated' : 'unauthenticated',
        //     });
        // });

        // return () => unsubscribe();
    }, []);

    return session;
}

export function useUser() {
    const { user, status } = useSession();
    return { user, isLoading: status === 'loading' };
}
