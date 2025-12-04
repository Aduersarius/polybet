const { Client } = require('pg');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query all rows from User table
        const query = `SELECT id, address, username FROM "User"`;
        const result = await client.query(query);

        const users = result.rows;
        console.log(`Total number of users: ${users.length}`);

        console.log('Users:');
        users.forEach(user => {
            console.log(`ID: ${user.id}, Address: ${user.address || 'N/A'}, Username: ${user.username || 'N/A'}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();