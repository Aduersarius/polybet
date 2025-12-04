const { Client } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Retrieve all events
        const eventsQuery = `SELECT id, "createdAt" FROM "Event"`;
        const eventsResult = await client.query(eventsQuery);
        const events = eventsResult.rows;
        console.log(`Retrieved ${events.length} events`);

        // Retrieve all users
        const usersQuery = `SELECT id FROM "User"`;
        const usersResult = await client.query(usersQuery);
        const users = usersResult.rows;
        console.log(`Retrieved ${users.length} users`);

        if (users.length === 0) {
            throw new Error('No users found in database');
        }

        let totalOrdersInserted = 0;

        for (const event of events) {
            const numOrders = Math.floor(Math.random() * (3000 - 500 + 1)) + 500;
            console.log(`Generating ${numOrders} orders for event ${event.id}`);

            const orders = [];
            for (let i = 0; i < numOrders; i++) {
                const userId = users[Math.floor(Math.random() * users.length)].id;
                const eventId = event.id;
                const outcomeId = null;
                const option = Math.random() < 0.5 ? 'yes' : 'no';
                const side = Math.random() < 0.5 ? 'buy' : 'sell';
                const price = Math.random() * (10.0 - 1.01) + 1.01;
                const amount = Math.random() * (100 - 10) + 10;
                const amountFilled = 0;
                const status = 'open';

                // Random timestamp between event.createdAt and now
                const startTime = new Date(event.createdAt).getTime();
                const endTime = Date.now();
                const randomTime = startTime + Math.random() * (endTime - startTime);
                const createdAt = new Date(randomTime).toISOString();
                const updatedAt = createdAt;

                const id = crypto.randomUUID();

                orders.push({
                    id,
                    userId,
                    eventId,
                    outcomeId,
                    option,
                    side,
                    price,
                    amount,
                    amountFilled,
                    status,
                    createdAt,
                    updatedAt
                });
            }

            // Batch insert in chunks of 1000
            const batchSize = 1000;
            let insertedForEvent = 0;
            for (let i = 0; i < orders.length; i += batchSize) {
                const batch = orders.slice(i, i + batchSize);
                const values = [];
                const placeholders = [];
                let paramIndex = 1;

                for (const order of batch) {
                    values.push(
                        order.id,
                        order.userId,
                        order.eventId,
                        order.outcomeId,
                        order.option,
                        order.side,
                        order.price,
                        order.amount,
                        order.amountFilled,
                        order.status,
                        order.createdAt,
                        order.updatedAt
                    );
                    placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`);
                    paramIndex += 12;
                }

                const insertQuery = `INSERT INTO "Order" (id, "userId", "eventId", "outcomeId", option, side, price, amount, "amountFilled", status, "createdAt", "updatedAt") VALUES ${placeholders.join(', ')}`;
                await client.query(insertQuery, values);
                insertedForEvent += batch.length;
            }

            console.log(`Seeded ${insertedForEvent} orders for event ${event.id}`);
            totalOrdersInserted += insertedForEvent;
        }

        console.log(`Total orders inserted: ${totalOrdersInserted}`);

    } catch (error) {
        console.error('Error:', error);
        // For seeding, we proceed even on error, but log it
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();