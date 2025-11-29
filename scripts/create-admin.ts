import { getPayload } from 'payload';
import config from '../payload.config';

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
            console.log('✅ Admin user already exists:', adminEmail);
            return;
        }

        // Create admin user
        const admin = await payload.create({
            collection: 'payload-users',
            data: {
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                username: 'Admin',
            },
        });

        console.log('✅ Admin user created successfully!');
        console.log('Email:', adminEmail);
        console.log('Password:', adminPassword);
        console.log('⚠️  IMPORTANT: Change this password after first login!');
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
    }

    process.exit(0);
}

createAdmin();
