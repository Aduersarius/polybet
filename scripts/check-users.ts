import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function setupAdmin() {
    console.log('Setting up admin user...\n');

    try {
        // First, let's see what's in the payload_users table
        const users = await prisma.$queryRaw`SELECT id, email, role FROM payload_users;`;

        console.log('Current users in payload_users:', users);
        console.log('');

        // Option 1: Clear all payload users (you'll see the "create first user" form)
        console.log('To enable "Create First User" form:');
        console.log('1. Run: npx tsx scripts/clear-payload-users.ts');
        console.log('');

        // Option 2: Create a specific admin user
        console.log('Or, to create admin user directly:');
        console.log('Email: admin@polybet.com');
        console.log('Password: admin123');
        console.log('');
        console.log('Run: npx tsx scripts/create-payload-admin.ts');

    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

setupAdmin();
