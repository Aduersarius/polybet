import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resend } from '@/lib/auth';

const LOGO_URL = 'https://jnlgh0ps99hx76my.public.blob.vercel-storage.com/diamond_logo_nobg.png';

// Email template for verification
const createVerificationEmailHTML = (verificationUrl: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your email - PolyBet</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                    <tr>
                        <td align="center" style="padding-bottom: 16px;">
                            <img src="${LOGO_URL}" alt="PolyBet" width="64" height="64" style="display: block;" />
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <span style="font-size: 28px; font-weight: bold; color: #8b5cf6;">PolyBet</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 24px; color: #ffffff; text-align: center;">
                                Verify your email
                            </h2>
                            <p style="margin: 0 0 32px; font-size: 16px; color: #9ca3af; text-align: center; line-height: 1.5;">
                                Click the button below to verify your email address.
                            </p>
                            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td align="center">
                                        <a href="${verificationUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 12px;">
                                            Verify Email
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 32px 0 0; font-size: 14px; color: #6b7280; text-align: center;">
                                If you didn't request this, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

// POST /api/user/send-verification - Send verification email
export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request);

        if (user.emailVerified) {
            return NextResponse.json({ error: 'Email already verified' }, { status: 400 });
        }

        if (!resend) {
            console.log('[EMAIL DEV] Would send verification to:', user.email);
            return NextResponse.json({
                success: true,
                message: 'Development mode - check console for verification URL'
            });
        }

        // Generate a verification token
        const token = crypto.randomUUID();
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

        // Send the email
        const result = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'PolyBet <noreply@polybet.ru>',
            to: user.email,
            subject: 'Verify your email - PolyBet',
            html: createVerificationEmailHTML(verificationUrl),
        });

        console.log('[EMAIL] Verification email sent:', result);

        return NextResponse.json({
            success: true,
            message: 'Verification email sent'
        });
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error('Error sending verification email:', error);
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
}
