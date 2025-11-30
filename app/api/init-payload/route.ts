import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../payload.config';

export async function POST(request: NextRequest) {
    try {
        console.log('Initializing Payload database...');

        const payload = await getPayload({
            config,
        });

        // Try to create a test user to ensure database is working
        const testUser = await payload.find({
            collection: 'payload-users',
            limit: 1,
        });

        console.log('Payload database initialized successfully');

        return NextResponse.json({
            success: true,
            message: 'Payload database initialized',
            userCount: testUser.docs.length,
        });
    } catch (error) {
        console.error('Payload initialization failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}