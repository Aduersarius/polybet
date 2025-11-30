import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function inspect() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const res = await client.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'payload_users';
    `);

        console.log('Columns in payload_users:');
        console.table(res.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

inspect();
