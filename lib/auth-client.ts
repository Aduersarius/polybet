import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"),
    plugins: [
        twoFactorClient()
    ]
});

// Export convenience hooks
export const { useSession } = authClient;

// Export signOut function wrapper
export const signOut = () => (authClient as any).signOut();

// Export 2FA methods - the twoFactorClient plugin adds these to authClient
export const twoFactor = {
    enable: async (password: string) => {
        return await (authClient as any).twoFactor.enable({ password });
    },
    disable: async (password: string) => {
        return await (authClient as any).twoFactor.disable({ password });
    },
    getTotpUri: async (password: string) => {
        return await (authClient as any).twoFactor.getTotpUri({ password });
    },
    verifyTotp: async (code: string, trustDevice?: boolean) => {
        return await (authClient as any).twoFactor.verifyTotp({ code, trustDevice });
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
