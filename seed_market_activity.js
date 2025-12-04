const { Client } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Query all orders
        const ordersQuery = `SELECT id, "userId", "eventId", "outcomeId", option, side, amount, price, "createdAt" FROM "Order"`;
        const ordersResult = await client.query(ordersQuery);
        const orders = ordersResult.rows;
        console.log(`Retrieved ${orders.length} orders`);

        if (orders.length === 0) {
            console.log('No orders found to seed MarketActivity');
            return;
        }

        let totalInserted = 0;

        // Process in batches of 1000
        const batchSize = 1000;
        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            const activities = [];

            for (const order of batch) {
                const activity = {
                    id: crypto.randomUUID(),
                    type: 'TRADE',
                    userId: order.userId,
                    eventId: order.eventId,
                    outcomeId: order.outcomeId,
                    option: order.option,
                    side: order.side,
                    amount: order.amount,
                    price: order.price,
                    isAmmInteraction: false,
                    orderId: order.id,
                    createdAt: order.createdAt
                };
                activities.push(activity);
            }

            // Batch insert
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const activity of activities) {
                values.push(
                    activity.id,
                    activity.type,
                    activity.userId,
                    activity.eventId,
                    activity.outcomeId,
                    activity.option,
                    activity.side,
                    activity.amount,
                    activity.price,
                    activity.isAmmInteraction,
                    activity.orderId,
                    activity.createdAt
                );
                placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`);
                paramIndex += 12;
            }

            const insertQuery = `INSERT INTO "MarketActivity" (id, type, "userId", "eventId", "outcomeId", option, side, amount, price, "isAmmInteraction", "orderId", "createdAt") VALUES ${placeholders.join(', ')}`;
            await client.query(insertQuery, values);

            totalInserted += activities.length;
            console.log(`Inserted ${totalInserted} MarketActivity records`);
        }

        console.log(`Total MarketActivity records inserted: ${totalInserted}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

main();