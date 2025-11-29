import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
    try {
        // Clear payload users
        await prisma.$executeRaw`DELETE FROM payload_users;`;

        return NextResponse.json({
            success: true,
            message: 'All Payload users cleared. Visit /admin/login to create your first user.'
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
