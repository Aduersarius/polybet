import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
    console.log('Checking users in database...\n');

    try {
        // Check Better Auth users table
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                username: true,
                address: true,
                isAdmin: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 10,
        });

        console.log(`Found ${users.length} users (showing first 10):`);
        console.table(users.map(u => ({
            id: u.id.slice(0, 8) + '...',
            email: u.email || 'N/A',
            username: u.username || 'N/A',
            address: u.address ? `${u.address.slice(0, 6)}...${u.address.slice(-4)}` : 'N/A',
            isAdmin: u.isAdmin ? 'Yes' : 'No',
            createdAt: u.createdAt.toISOString().split('T')[0],
        })));

        const adminCount = await prisma.user.count({
            where: { isAdmin: true },
        });

        console.log(`\nTotal admin users: ${adminCount}`);
        console.log('\nTo create an admin user, use Better Auth signup and then update the user:');
        console.log('Run: npx tsx scripts/make-admin.ts <user-id>');

    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
