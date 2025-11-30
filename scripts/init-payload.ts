import { getPayload } from 'payload';
import config from '../payload.config';

async function initPayload() {
    try {
        console.log('Initializing Payload...');

        const payload = await getPayload({
            config,
        });

        console.log('Payload initialized successfully');

        // Test database connection by trying to find users
        const users = await payload.find({
            collection: 'payload-users',
            limit: 1,
        });

        console.log('Database connection test passed - found', users.docs.length, 'users');

        process.exit(0);
    } catch (error) {
        console.error('Payload initialization failed:', error);
        process.exit(1);
    }
}

initPayload();