const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query all unique categories from Event table
        const query = `SELECT DISTINCT unnest(categories) AS category FROM "Event" WHERE categories IS NOT NULL AND array_length(categories, 1) > 0 ORDER BY category`;
        const result = await client.query(query);

        const categories = result.rows.map(row => row.category);
        console.log(`Total number of unique categories: ${categories.length}`);

        console.log('Categories:');
        categories.forEach(category => {
            console.log(`- ${category}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();