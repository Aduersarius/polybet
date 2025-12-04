const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query favorites
        const query = `
            SELECT uf."userId", uf."eventId", uf."createdAt",
                   u."address" as user_address,
                   e."id" as event_id, e."title" as event_title, e."status" as event_status
            FROM "UserFavorite" uf
            JOIN "User" u ON uf."userId" = u."id"
            JOIN "Event" e ON uf."eventId" = e."id"
            ORDER BY uf."createdAt" DESC
            LIMIT 20;
        `;
        const result = await client.query(query);

        console.log(`Found ${result.rows.length} favorites:`);
        result.rows.forEach(row => {
            console.log(`UserID: ${row.userId}, UserAddr: ${row.user_address || 'null'}, EventID: ${row.event_id}, Event: ${row.event_title}, Status: ${row.event_status}, Created: ${row.createdAt}`);
        });

        // Also check total count
        const countQuery = `SELECT COUNT(*) as total FROM "UserFavorite";`;
        const countResult = await client.query(countQuery);
        console.log(`Total favorites: ${countResult.rows[0].total}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();