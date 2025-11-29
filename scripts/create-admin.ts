import { getPayload } from 'payload';
import config from '@payload-config';

async function createAdmin() {
    const payload = await getPayload({ config });

    const adminEmail = 'admin@polybet.com';
    const adminPassword = 'admin123'; // Change this after first login!

    try {
        // Check if admin already exists
        const existingUsers = await payload.find({
            collection: 'payload-users',
            where: {
                email: {
                    equals: adminEmail,
                },
            },
        });

        if (existingUsers.docs.length > 0) {
            console.log('ℹ️  Admin user already exists');
            console.log('📧 Email:', adminEmail);
            console.log('');
            console.log('To reset password, delete the user first:');
            console.log('npx prisma studio');
            console.log('(or delete from payload_users table via SQL)');
            process.exit(0);
        }

        // Create admin user
        await payload.create({
            collection: 'payload-users',
            data: {
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                username: 'Admin',
            },
        });

        console.log('');
        console.log('✅ Admin user created successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:', adminEmail);
        console.log('🔑 Password:', adminPassword);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('⚠️  IMPORTANT: Change this password after first login!');
        console.log('🔗 Login at: http://localhost:3000/admin/login');
        console.log('');
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }

    process.exit(0);
}

createAdmin();
