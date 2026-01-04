import { createHmac } from 'crypto';

export interface AlchemyWebhookPayload {
    webhookId: string;
    id: string;
    createdAt: string;
    type: 'ADDRESS_ACTIVITY';
    event: {
        network: string;
        activity: Array<{
            category: string;
            fromAddress: string;
            toAddress: string;
            blockNum: string;
            hash: string;
            value: number | null;
            asset: string | null;
            rawContract: {
                rawValue: string;
                address: string | null;
                decimals: number | null;
            };
            log?: {
                address: string;
                topics: string[];
                data: string;
            };
        }>;
    };
}

/**
 * Verify Alchemy webhook signature
 * 
 * @param body The raw body of the request as a string
 * @param signature The x-alchemy-signature header
 * @param signingKey The signing key from Alchemy dashboard (env var)
 */
export function verifyAlchemySignature(
    body: string,
    signature: string,
    signingKey: string
): boolean {
    try {
        const hmac = createHmac('sha256', signingKey);
        hmac.update(body, 'utf8');
        const digest = hmac.digest('hex');
        return signature === digest;
    } catch (error) {
        console.error('Error verifying Alchemy signature:', error);
        return false;
    }
}
