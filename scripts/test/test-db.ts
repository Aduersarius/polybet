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

        // Check User table schema (Better Auth)
        const res = await client.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'user'
            ORDER BY ordinal_position;
        `);

        console.log('Schema for user table (Better Auth):');
        console.table(res.rows);

        // Check if we can query users
        const userCount = await client.query(`SELECT COUNT(*) as count FROM "user";`);
        console.log(`\nTotal users in database: ${userCount.rows[0].count}`);

        await client.end();
    } catch (err) {
        console.error('Connection error:', err);
    }
}

testConnection();
