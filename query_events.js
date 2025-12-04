const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query all rows from Event table
        const query = `SELECT id, title, "createdAt", "resolutionDate" FROM "Event"`;
        const result = await client.query(query);

        const events = result.rows;
        console.log(`Total number of events: ${events.length}`);

        console.log('Events:');
        events.forEach(event => {
            console.log(`ID: ${event.id}, Title: ${event.title}, Created At: ${event.createdAt}, Resolution Date: ${event.resolutionDate}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();