import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
    let client: Client | null = null;

    try {
        console.log('Setting up Payload database tables...');

        // Use the same DATABASE_URL that Payload uses
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is not set');
        }

        // Create PostgreSQL client
        client = new Client({
            connectionString: databaseUrl,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        });

        await client.connect();

        // Just add the missing password column
        await client.query(`ALTER TABLE "payload_users" ADD COLUMN IF NOT EXISTS "password" varchar;`);

        console.log('Payload tables created successfully');

        return NextResponse.json({
            success: true,
            message: 'Payload database tables created successfully',
        });
    } catch (error) {
        console.error('Failed to create Payload tables:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.end();
        }
    }
}