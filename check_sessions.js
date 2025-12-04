const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Check sessions for the user with favorites
        const query = `
            SELECT s."token", s."userId", s."expiresAt", u."address", u."username"
            FROM "Session" s
            JOIN "User" u ON s."userId" = u."id"
            WHERE s."userId" = 'ChSm4U0Ouovki1Xsy4Qjl2L8D8SsRENK'
            ORDER BY s."createdAt" DESC
            LIMIT 5;
        `;
        const result = await client.query(query);

        console.log('Sessions for user with favorites:');
        result.rows.forEach(row => {
            console.log(`UserID: ${row.userId}, Address: ${row.address}, Username: ${row.username}, Expires: ${row.expiresAt}`);
        });

        // Check recent sessions
        const recentQuery = `
            SELECT s."token", s."userId", s."expiresAt", u."address", u."username"
            FROM "Session" s
            JOIN "User" u ON s."userId" = u."id"
            ORDER BY s."createdAt" DESC
            LIMIT 10;
        `;
        const recentResult = await client.query(recentQuery);

        console.log('\nRecent sessions:');
        recentResult.rows.forEach(row => {
            console.log(`UserID: ${row.userId}, Address: ${row.address}, Username: ${row.username}, Expires: ${row.expiresAt}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();