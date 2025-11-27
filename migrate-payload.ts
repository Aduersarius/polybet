#!/usr/bin/env node
import { getPayload } from 'payload';
import config from './payload.config.ts';

async function migrate() {
    try {
        console.log('Running Payload migrations...');
        const payload = await getPayload({ config });
        console.log('Payload initialized successfully');
        console.log('Tables should now exist');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
