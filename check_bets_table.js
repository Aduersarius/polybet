const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query all tables in public schema
        const tablesQuery = `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `;
        const tablesResult = await client.query(tablesQuery);

        console.log('All tables in public schema:');
        const tableNames = tablesResult.rows.map(row => row.table_name);
        console.log(tableNames.join(', '));

        // Check if 'bets' table exists
        const hasBetsTable = tableNames.includes('bets');
        console.log(`\nDoes 'bets' table exist? ${hasBetsTable}`);

        if (hasBetsTable) {
            console.log('Truncating bets table...');
            await client.query('TRUNCATE TABLE bets CASCADE');
            console.log('Bets table truncated successfully.');
        } else {
            console.log('No bets table found, skipping truncation.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();