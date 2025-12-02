import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
    if (!redisClient) {
        redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    }
    return redisClient;
}

export async function publishAdminEvent(eventType: string, payload?: any) {
    try {
        const redis = getRedisClient();
        await redis.publish('admin-events', JSON.stringify({
            type: eventType,
            payload: payload || {},
            timestamp: new Date().toISOString()
        }));
    } catch (error) {
        console.error('Failed to publish admin event:', error);
    }
}
