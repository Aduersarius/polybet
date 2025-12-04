const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        await client.query('TRUNCATE TABLE "Balance";');
        console.log('Table "Balance" has been truncated successfully.');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();