import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function fix() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        // Alter salt and hash columns to TEXT to avoid length limits
        await client.query(`
      ALTER TABLE payload_users 
      ALTER COLUMN salt TYPE text,
      ALTER COLUMN hash TYPE text;
    `);

        console.log('Successfully altered salt and hash columns to TEXT');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

fix();
