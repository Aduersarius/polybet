import { NextRequest, NextResponse } from 'next/server';
import { getPayloadHMR } from '@payloadcms/next/utilities';
import config from '@payload-config';

export const GET = async (req: NextRequest) => {
    const payload = await getPayloadHMR({ config });

    return NextResponse.json({
        message: 'Payload API',
        collections: payload.config.collections.map((c) => c.slug),
    });
};
