import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { symmetricDecrypt } from 'better-auth/crypto';

// Debug endpoint to diagnose TOTP issues
export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const userId = session.user.id;

        // Get user and TwoFactor record
        const [user, twoFactorRecord] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, twoFactorEnabled: true }
            }),
            prisma.twoFactor.findUnique({
                where: { userId },
                select: { secret: true, backupCodes: true }
            })
        ]);

        const result: any = {
            userId,
            email: user?.email,
            twoFactorEnabled: user?.twoFactorEnabled,
            hasTwoFactorRecord: !!twoFactorRecord,
            secretLength: twoFactorRecord?.secret?.length,
            secretPrefix: twoFactorRecord?.secret?.substring(0, 20),
            hasBackupCodes: !!twoFactorRecord?.backupCodes,
        };

        // Try to determine secret format
        if (twoFactorRecord?.secret) {
            const isBase32 = /^[A-Z2-7]+=*$/.test(twoFactorRecord.secret.replace(/\s+/g, ''));
            result.secretFormat = isBase32 ? 'base32 (unencrypted)' : 'encrypted';

            // Try to decrypt if encrypted
            if (!isBase32) {
                const authSecret = process.env.BETTER_AUTH_SECRET;
                result.authSecretExists = !!authSecret;
                result.authSecretLength = authSecret?.length;

                if (authSecret) {
                    try {
                        const decrypted = await symmetricDecrypt({
                            key: authSecret,
                            data: twoFactorRecord.secret
                        });
                        result.decryptionSuccess = true;
                        result.decryptedLength = decrypted.length;
                        result.decryptedIsBase32 = /^[A-Z2-7]+=*$/.test(decrypted.replace(/\s+/g, ''));
                    } catch (e: any) {
                        result.decryptionSuccess = false;
                        result.decryptionError = e.message;
                    }
                }
            }
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[debug-totp] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
