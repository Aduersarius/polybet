const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Check if UserFavorite table exists
        const query = `
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'UserFavorite'
            ) AS table_exists;
        `;
        const result = await client.query(query);

        const exists = result.rows[0].table_exists;
        console.log(`UserFavorite table exists: ${exists}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();