const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function queryMarketActivity() {
    const client = new Client({
        connectionString: DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to the database.');

        // Query total count
        const countResult = await client.query('SELECT COUNT(*) FROM "MarketActivity"');
        const totalCount = countResult.rows[0].count;
        console.log(`Total records in MarketActivity table: ${totalCount}`);

        // Query sample rows
        const sampleResult = await client.query('SELECT * FROM "MarketActivity" LIMIT 10');
        console.log('Sample rows from MarketActivity table:');
        sampleResult.rows.forEach((row, index) => {
            console.log(`${index + 1}:`, row);
        });

    } catch (error) {
        console.error('Error querying MarketActivity table:', error.message);
    } finally {
        await client.end();
        console.log('Database connection closed.');
    }
}

queryMarketActivity();