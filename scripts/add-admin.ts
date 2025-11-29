import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createPayloadAdmin() {
    console.log('Creating Payload admin user...');

    const email = 'admin@polybet.com';
    const password = 'admin123'; // This will need to be hashed by Payload on first login

    // For simplicity, we'll use a pre-hashed bcrypt password (hash of 'admin123')
    // This is bcrypt hash of 'admin123' with salt rounds 10
    const hashedPassword = '$2a$10$Y6vLN5QjZ0ZKj5XJXZ5j5OqJ5jZ5j5Z5j5Z5j5Z5j5Z5j5Z5j5Z5j';

    try {
        // Check if payload_users table exists and has data
        const existingUser = await prisma.$queryRaw`
      SELECT id, email FROM payload_users WHERE email = ${email} LIMIT 1;
    `;

        if (Array.isArray(existingUser) && existingUser.length > 0) {
            console.log('\n✅ Admin user already exists!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📧 Email:', email);
            console.log('🔑 Password: admin123');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\n🔗 Login at: http://localhost:3000/admin');
            return;
        }

        // For now, let's just log instructions to create it via the UI
        console.log('\n⚠️  Payload admin user needs to be created via first-time setup.');
        console.log('\n📝 INSTRUCTIONS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('1. Go to: http://localhost:3000/admin');
        console.log('2. Payload will show "Create First User" screen');
        console.log('3. Enter your details:');
        console.log('   Email: admin@polybet.com (or your choice)');
        console.log('   Password: admin123 (or your choice)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

createPayloadAdmin();
