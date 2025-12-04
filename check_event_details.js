const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Check specific events
        const query = `
            SELECT id, title, status, "isHidden"
            FROM "Event"
            WHERE id IN ('gta6-release-2025', 'mars-sample-return');
        `;
        const result = await client.query(query);

        console.log('Event details:');
        result.rows.forEach(row => {
            console.log(`ID: ${row.id}, Title: ${row.title}, Status: ${row.status}, isHidden: ${row.isHidden}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();