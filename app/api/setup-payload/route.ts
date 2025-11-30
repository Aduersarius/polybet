import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
    try {
        console.log('Setting up Payload database tables...');

        // Read the SQL file
        const sqlPath = path.join(process.cwd(), 'scripts', 'create-payload-tables.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Execute the SQL
        await sql.query(sqlContent);

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
    }
}