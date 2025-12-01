const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Simple cuid generator (simplified version)
function generateId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function createAdmins() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // User 1: nvgolovin@yandex.ru
        const email1 = 'nvgolovin@yandex.ru';
        const username1 = 'nik0layG';

        // Check if user exists by email
        const existingUser1 = await client.query(
            'SELECT id, email, username, "isAdmin" FROM "User" WHERE email = $1',
            [email1]
        );

        if (existingUser1.rowCount > 0) {
            // User exists, make them admin
            const result = await client.query(
                'UPDATE "User" SET "isAdmin" = true, username = $2 WHERE email = $1 RETURNING id, email, username, "isAdmin"',
                [email1, username1]
            );
            console.log(`✅ Updated ${email1} to admin with username ${username1}`);
            console.log(result.rows[0]);
        } else {
            // Create new user with generated ID
            const userId = generateId();
            const result = await client.query(
                'INSERT INTO "User" (id, email, username, "isAdmin", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, NOW(), NOW()) RETURNING id, email, username, "isAdmin"',
                [userId, email1, username1]
            );
            console.log(`✅ Created new admin user: ${email1} with username ${username1}`);
            console.log(result.rows[0]);
            console.log('⚠️  User needs to complete signup to set password via Better Auth');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

createAdmins();

