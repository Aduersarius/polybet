const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function updateUser() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();

        const result = await client.query(
            'UPDATE "User" SET username = $1 WHERE email = $2 RETURNING id, email, username, "isAdmin"',
            ['everlastinflexx', 'nvgolovin@yandex.ru']
        );

        console.log('✅ Updated user:', result.rows[0]);
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

updateUser();
