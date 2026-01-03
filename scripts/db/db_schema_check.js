const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query schema details for specific tables
        const query = `
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name IN ('MarketActivity', 'Order', 'Event', 'Bet')
            ORDER BY table_name, ordinal_position
        `;
        const result = await client.query(query);

        console.log('Schema details for tables MarketActivity, Order, and Event:');
        result.rows.forEach(row => {
            console.log(`Table: ${row.table_name}`);
            console.log(`  Column: ${row.column_name}`);
            console.log(`  Data Type: ${row.data_type}`);
            console.log(`  Nullable: ${row.is_nullable}`);
            console.log(`  Default: ${row.column_default || 'None'}`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();