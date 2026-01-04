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
        return await (authClient as any).twoFactor.enable({ password });
    },
    disable: async (password: string) => {
        return await (authClient as any).twoFactor.disable({ password });
    },
    getTotpUri: async (password: string) => {
        try {
            // Better Auth's twoFactor.getTotpUri might return the data directly or in a specific format
            // Let's try calling it and see what we get
            const result = await (authClient as any).twoFactor.getTotpUri({ password });
            
            // Log everything for debugging
            console.log('[2FA] getTotpUri result type:', typeof result);
            console.log('[2FA] getTotpUri result:', result);
            console.log('[2FA] getTotpUri result keys:', result ? Object.keys(result) : 'null/undefined');
            console.log('[2FA] getTotpUri result stringified:', JSON.stringify(result, null, 2));
            
            // Better Auth client methods might return the data directly or in { data, error } format
            // Check for error first
            if (result?.error) {
                console.error('[2FA] getTotpUri error in response:', result.error);
                return result;
            }
            
            // Try to extract URI from various possible response formats
            // Better Auth returns: { totpURI: string } (note: capital URI)
            let uri = null;
            
            if (typeof result === 'string' && result.startsWith('otpauth://')) {
                // Direct URI string
                uri = result;
            } else if (result?.totpURI && typeof result.totpURI === 'string') {
                // Better Auth uses totpURI (capital URI)
                uri = result.totpURI;
            } else if (result?.data?.totpURI && typeof result.data.totpURI === 'string') {
                uri = result.data.totpURI;
            } else if (result?.uri && typeof result.uri === 'string') {
                uri = result.uri;
            } else if (result?.data?.uri && typeof result.data.uri === 'string') {
                uri = result.data.uri;
            } else if (result?.totpUri && typeof result.totpUri === 'string') {
                uri = result.totpUri;
            } else if (result?.data?.totpUri && typeof result.data.totpUri === 'string') {
                uri = result.data.totpUri;
            }
            
            if (uri && typeof uri === 'string' && uri.startsWith('otpauth://')) {
                console.log('[2FA] Successfully extracted URI:', uri.substring(0, 50) + '...');
                return { data: { uri }, error: null };
            }
            
            // If we get here, something is wrong
            console.error('[2FA] No valid URI found in response. Full result:', result);
            console.error('[2FA] Result type:', typeof result);
            console.error('[2FA] Result is array?', Array.isArray(result));
            
            // Check if it's a network/API error
            if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
                return {
                    error: {
                        message: 'Server returned empty response. Please check your password and try again.'
                    }
                };
            }
            
            return {
                error: {
                    message: 'Failed to get TOTP URI from server response. Please check console for details.'
                }
            };
        } catch (error: any) {
            console.error('[2FA] getTotpUri exception:', error);
            console.error('[2FA] Error stack:', error?.stack);
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

            const result = await (authClient as any).twoFactor.verifyTotp({
                code: sanitizedCode,
                trustDevice: trustDevice ?? false
            });

            return result;
        } catch (error: any) {
            console.error('[2FA] verifyTotp error:', error);
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
