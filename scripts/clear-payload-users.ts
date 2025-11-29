import { prisma } from '../lib/prisma';

async function clearPayloadUsers() {
    console.log('⚠️  Clearing all Payload users from remote database...\n');

    try {
        const result = await prisma.$executeRaw`DELETE FROM payload_users;`;
        console.log('✅ Deleted', result, 'user(s) from payload_users table');
        console.log('');
        console.log('🔗 Now visit: http://localhost:3000/admin/login');
        console.log('📝 You should see "Create your first user" form');
        console.log('');
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

clearPayloadUsers();
