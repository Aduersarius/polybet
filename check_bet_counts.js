const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query bet counts per event
        const query = `
            SELECT "eventId", COUNT(*) as bet_count
            FROM "MarketActivity"
            WHERE type = 'BET'
            GROUP BY "eventId"
            ORDER BY bet_count DESC
            LIMIT 10
        `;
        const result = await client.query(query);

        console.log('Top 10 events by bet count:');
        result.rows.forEach(row => {
            console.log(`Event ID: ${row.eventId}, Bet Count: ${row.bet_count}`);
        });

        // Also check qYes and qNo for a few events
        const eventQuery = `SELECT id, "qYes", "qNo" FROM "Event" WHERE type = 'BINARY' LIMIT 5`;
        const eventResult = await client.query(eventQuery);

        console.log('\nBinary events qYes/qNo:');
        eventResult.rows.forEach(event => {
            console.log(`Event ID: ${event.id}, qYes: ${event.qYes}, qNo: ${event.qNo}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();