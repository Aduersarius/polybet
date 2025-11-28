import 'dotenv/config';
import { Client } from 'pg';

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

async function testConnection() {
    console.log('Testing connection to:', connectionString?.split('@')[1]); // Log host only for safety
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
    });

    try {
        await client.connect();
        console.log('Connected successfully!');

        const res = await client.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'payload_users';
        `);

        console.log('Schema for payload_users:');
        console.table(res.rows);

        console.log('Attempting direct INSERT...');
        const testEmail = `sql-test-${Date.now()}@example.com`;
        const insertRes = await client.query(`
            INSERT INTO payload_users (email, created_at, updated_at)
            VALUES ($1, NOW(), NOW())
            RETURNING id;
        `, [testEmail]);
        console.log('Insert success! ID:', insertRes.rows[0].id);

        await client.end();
    } catch (err) {
        console.error('Connection error:', err);
    }
}

testConnection();
