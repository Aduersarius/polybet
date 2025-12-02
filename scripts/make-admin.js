const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const email = process.argv[2];
if (!email) {
    console.error('Usage: node scripts/make-admin.js <email>');
    process.exit(1);
}

async function makeAdmin() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        const result = await client.query(
            'UPDATE "User" SET "isAdmin" = true WHERE email = $1 RETURNING id, email, "isAdmin"',
            [email]
        );

        if (result.rowCount === 0) {
            console.log(`❌ No user found with email: ${email}`);
        } else {
            console.log(`✅ User ${email} is now an admin!`);
            console.log(result.rows[0]);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

makeAdmin();
