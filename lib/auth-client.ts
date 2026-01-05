import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    plugins: [
        twoFactorClient()
    ]
});

// Export convenience hooks
export const { useSession } = authClient;

// Export signOut function wrapper with proper cache clearing
export const signOut = async () => {
    try {
        if (typeof window === 'undefined') {
            return;
        }

        // Clear React Query cache if available
        const queryClient = (window as any).__REACT_QUERY_CLIENT__;
        if (queryClient) {
            queryClient.clear();
            // Also remove all queries to ensure nothing persists
            queryClient.removeQueries();
        }

        // Clear any auth-related localStorage/sessionStorage
        // Better-auth might store session data here
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('auth') || key.includes('session') || key.includes('better-auth'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));

            // Also clear sessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && (key.includes('auth') || key.includes('session') || key.includes('better-auth'))) {
                    sessionStorage.removeItem(key);
                }
            }
        } catch (storageError) {
            // Ignore storage errors (might be in private mode)
            console.warn('Could not clear storage:', storageError);
        }

        // Sign out via auth client
        await (authClient as any).signOut();

        // Small delay to ensure signOut completes and cookies are cleared
        await new Promise(resolve => setTimeout(resolve, 150));

        // Force a hard navigation to clear all state
        // Using window.location.replace prevents back button from going to signed-in state
        // This clears all React state, cache, and forces a fresh session check
        window.location.replace('/');
    } catch (error) {
        console.error('Error signing out:', error);
        // Fallback: force navigation even if signOut fails
        // Clear cache before navigation
        if (typeof window !== 'undefined') {
            const queryClient = (window as any).__REACT_QUERY_CLIENT__;
            if (queryClient) {
                queryClient.clear();
                queryClient.removeQueries();
            }
            // Force navigation
            window.location.replace('/');
        }
    }
};

// Export 2FA methods - the twoFactorClient plugin adds these to authClient
export const twoFactor = {
    enable: async (password: string) => {
        try {
            const result = await (authClient as any).twoFactor.enable({ password });
            console.log('[2FA] enable result:', result);

            // Check for error
            if (result?.error) {
                console.error('[2FA] enable error:', result.error);
                return result;
            }

            // Better Auth returns { data: { totpURI, backupCodes }, error: null } or similar
            // Return the result as-is for the client to handle
            return result;
        } catch (error: any) {
            console.error('[2FA] enable exception:', error);
            return {
                error: {
                    message: error?.message || 'Failed to enable 2FA'
                }
            };
        }
    },
    disable: async (password: string) => {
        try {
            const result = await (authClient as any).twoFactor.disable({ password });
            return result;
        } catch (error: any) {
            console.error('[2FA] disable exception:', error);
            return {
                error: {
                    message: error?.message || 'Failed to disable 2FA'
                }
            };
        }
    },
    getTotpUri: async (password: string) => {
        try {
            // This is used to re-fetch the TOTP URI after enable() has been called
            // but before verifyTotp() has been called
            const result = await (authClient as any).twoFactor.getTotpUri({ password });
            console.log('[2FA] getTotpUri result:', result);

            if (result?.error) {
                console.error('[2FA] getTotpUri error:', result.error);
                return result;
            }

            return result;
        } catch (error: any) {
            console.error('[2FA] getTotpUri exception:', error);
            return {
                error: {
                    message: error?.message || 'Failed to get TOTP URI'
                }
            };
        }
    },
    verifyTotp: async (code: string, trustDevice?: boolean) => {
        try {
            // Sanitize TOTP code: remove spaces and ensure it's exactly 6 digits
            const sanitizedCode = (code || '').replace(/\s+/g, '').trim();

            // Validate code format before sending to better-auth
            if (!sanitizedCode || sanitizedCode.length !== 6 || !/^\d{6}$/.test(sanitizedCode)) {
                return { error: { message: 'TOTP code must be exactly 6 digits' } };
            }

            console.log('[2FA] Calling Better Auth verifyTotp...');
            const result = await (authClient as any).twoFactor.verifyTotp({
                code: sanitizedCode,
                trustDevice: trustDevice ?? false
            });
            console.log('[2FA] verifyTotp raw result:', JSON.stringify(result));

            // Better Auth sometimes returns { data: null } on failure without explicit error
            if (!result?.data && !result?.error) {
                console.error('[2FA] Unexpected empty response from verifyTotp');
                return { error: { message: 'Verification failed. Please try again.' } };
            }

            return result;
        } catch (error: any) {
            console.error('[2FA] verifyTotp exception:', error);
            return {
                error: {
                    message: error?.message || 'Failed to verify TOTP code. Please try again.'
                }
            };
        }
    },
    generateBackupCodes: async (password: string) => {
        return await (authClient as any).twoFactor.generateBackupCodes({ password });
    },
};

// Export email methods
export const email = {
    sendVerificationEmail: async () => {
        // Try the standard better-auth path
        return await (authClient as any).emailVerification?.sendVerificationEmail()
            ?? await (authClient as any).sendVerificationEmail?.()
            ?? await fetch('/api/auth/send-verification-email', {
                method: 'POST',
                credentials: 'include'
            }).then(r => r.json());
    },
    changeEmail: async (newEmail: string) => {
        return await (authClient as any).changeEmail({ newEmail });
    },
    forgetPassword: async (email: string, redirectTo: string = '/reset-password') => {
        return await (authClient as any).forgetPassword({
            email,
            redirectTo,
        });
    },
    resetPassword: async (newPassword: string) => {
        return await (authClient as any).resetPassword({
            newPassword,
        });
    },
};
