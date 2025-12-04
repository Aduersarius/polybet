const { Client } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = "postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable";

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Retrieve all events
        const eventsQuery = `SELECT id, "createdAt", "resolutionDate" FROM "Event"`;
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
        let totalActivitiesInserted = 0;

        for (const event of events) {
            const numOrders = Math.floor(Math.random() * (3000 - 500 + 1)) + 500;
            console.log(`Generating ${numOrders} orders for event ${event.id}`);

            // Generate random trend parameters per event
            const k = (Math.random() - 0.5) * 4; // random direction and strength, -2 to 2
            const trendMax = Math.max(1, Math.exp(k));

            // Generate timestamps with trend and seasonality
            const startTime = new Date(event.createdAt).getTime();
            const endTime = Math.min(new Date(event.resolutionDate).getTime(), Date.now());
            const duration = endTime - startTime;
            let timestamps = [];
            if (duration <= 0) {
                timestamps = Array(numOrders).fill(new Date(startTime));
            } else {
                const maxPDF = 120; // sufficient for max pdf ~106
                while (timestamps.length < numOrders) {
                    const t = Math.random();
                    const actualTime = new Date(startTime + t * duration);
                    const hour = actualTime.getHours();
                    const day = actualTime.getDay();
                    const date = actualTime.getDate();
                    const monthDays = new Date(actualTime.getFullYear(), actualTime.getMonth() + 1, 0).getDate();
                    const monthlyMult = date >= monthDays - 2 ? 2.0 : 1.0; // higher activity last 3 days of month
                    const dailyMult = (hour >= 9 && hour <= 17) ? 2 : 0.5;
                    const weeklyMult = (day >= 1 && day <= 5) ? 1.5 : 0.5;
                    // hourly patterns within business hours
                    let hourlyMult = 1.0;
                    if (hour >= 9 && hour <= 17) {
                        const hourInDay = hour - 9; // 0 to 8
                        const peak1 = Math.exp(-Math.pow(hourInDay - 2, 2) / 2); // peak at 11am
                        const peak2 = Math.exp(-Math.pow(hourInDay - 6, 2) / 2); // peak at 15pm
                        hourlyMult = 1 + (peak1 + peak2) * 0.5;
                    }
                    // add random noise
                    const noise = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2
                    const totalSeasonality = dailyMult * weeklyMult * monthlyMult * hourlyMult * (1 + noise);
                    const pdf = Math.exp(k * t) * totalSeasonality;
                    if (Math.random() * maxPDF < pdf) {
                        timestamps.push(actualTime);
                    }
                }
            }
            timestamps.sort((a, b) => a - b);

            // Query outcomes for the event
            const outcomesQuery = `SELECT id, name FROM "Outcome" WHERE "eventId" = $1`;
            const outcomesResult = await client.query(outcomesQuery, [event.id]);
            const outcomes = outcomesResult.rows;

            const batchSize = 1000;
            let ordersBatch = [];
            let activitiesBatch = [];

            for (let i = 0; i < numOrders; i++) {
                const userId = users[Math.floor(Math.random() * users.length)].id;
                const eventId = event.id;
                let outcomeId = null;
                let option = null;

                if (outcomes.length === 0) {
                    // Binary event
                    option = Math.random() < 0.5 ? 'yes' : 'no';
                } else {
                    // Multiple outcome event
                    const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
                    outcomeId = randomOutcome.id;
                }
                const side = Math.random() < 0.5 ? 'buy' : 'sell';
                const price = Math.random() * (10.0 - 1.01) + 1.01;
                const amount = Math.random() * (100 - 10) + 10;
                const amountFilled = 0;
                const status = 'open';

                const createdAt = timestamps[i].toISOString();
                const updatedAt = createdAt;

                const orderId = crypto.randomUUID();

                const order = {
                    id: orderId,
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
                };

                const activity = {
                    id: crypto.randomUUID(),
                    type: 'TRADE',
                    userId,
                    eventId,
                    outcomeId,
                    option,
                    side,
                    amount,
                    price,
                    isAmmInteraction: false,
                    orderId,
                    createdAt
                };

                ordersBatch.push(order);
                activitiesBatch.push(activity);

                // Insert batch when it reaches batchSize
                if (ordersBatch.length >= batchSize) {
                    await insertBatch(client, ordersBatch, activitiesBatch);
                    totalOrdersInserted += ordersBatch.length;
                    totalActivitiesInserted += activitiesBatch.length;
                    ordersBatch = [];
                    activitiesBatch = [];
                }
            }

            // Insert remaining batch
            if (ordersBatch.length > 0) {
                await insertBatch(client, ordersBatch, activitiesBatch);
                totalOrdersInserted += ordersBatch.length;
                totalActivitiesInserted += activitiesBatch.length;
            }

            console.log(`Seeded ${numOrders} orders and activities for event ${event.id}`);
        }

        console.log(`Total orders inserted: ${totalOrdersInserted}`);
        console.log(`Total activities inserted: ${totalActivitiesInserted}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

async function insertBatch(client, orders, activities) {
    // Insert orders
    const orderValues = [];
    const orderPlaceholders = [];
    let paramIndex = 1;

    for (const order of orders) {
        orderValues.push(
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
        orderPlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`);
        paramIndex += 12;
    }

    const insertOrdersQuery = `INSERT INTO "Order" (id, "userId", "eventId", "outcomeId", option, side, price, amount, "amountFilled", status, "createdAt", "updatedAt") VALUES ${orderPlaceholders.join(', ')}`;
    await client.query(insertOrdersQuery, orderValues);

    // Insert activities
    const activityValues = [];
    const activityPlaceholders = [];
    paramIndex = 1;

    for (const activity of activities) {
        activityValues.push(
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
        activityPlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`);
        paramIndex += 12;
    }

    const insertActivitiesQuery = `INSERT INTO "MarketActivity" (id, type, "userId", "eventId", "outcomeId", option, side, amount, price, "isAmmInteraction", "orderId", "createdAt") VALUES ${activityPlaceholders.join(', ')}`;
    await client.query(insertActivitiesQuery, activityValues);
}

main();