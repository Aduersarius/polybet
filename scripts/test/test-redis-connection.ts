#!/usr/bin/env tsx
/**
 * Test Redis connection with the configured REDIS_URL
 * Usage: npx tsx scripts/test-redis-connection.ts
 */

import Redis from 'ioredis';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('🔍 Testing Redis Connection...');
console.log('📍 REDIS_URL:', redisUrl.replace(/:[^:@]+@/, ':****@')); // Mask password
console.log('');

// Parse URL to extract components
function parseRedisUrl(url: string) {
    try {
        const urlObj = new URL(url);
        // Extract password from URL - it's in the format rediss://:password@host:port
        let password: string | undefined;
        if (urlObj.password) {
            password = urlObj.password;
        } else if (url.includes('@')) {
            // Try to extract from :password@ format
            const match = url.match(/redis[s]?:\/\/:([^@]+)@/);
            if (match) {
                password = match[1];
            }
        }
        
        return {
            protocol: urlObj.protocol.replace(':', ''),
            host: urlObj.hostname,
            port: urlObj.port || (url.startsWith('rediss://') ? '6380' : '6379'),
            password: password,
            hasPassword: !!password,
            passwordLength: password?.length || 0,
        };
    } catch (err) {
        console.error('❌ Failed to parse REDIS_URL:', err);
        return null;
    }
}

const parsed = parseRedisUrl(redisUrl);
if (parsed) {
    console.log('📋 Parsed URL:');
    console.log(`   Protocol: ${parsed.protocol}`);
    console.log(`   Host: ${parsed.host}`);
    console.log(`   Port: ${parsed.port}`);
    console.log(`   Has Password: ${parsed.hasPassword ? 'Yes' : 'No'}`);
    if (parsed.hasPassword) {
        console.log(`   Password Length: ${parsed.passwordLength} characters`);
        // Show first and last character for verification (without revealing full password)
        if (parsed.password) {
            const firstChar = parsed.password[0];
            const lastChar = parsed.password[parsed.password.length - 1];
            console.log(`   Password Preview: ${firstChar}...${lastChar} (${parsed.passwordLength} chars)`);
        }
    }
    console.log('');
}

// Build TLS config if using rediss://
function buildTlsConfig(url: string) {
    if (!url.startsWith('rediss://')) return undefined;

    const allowSelfSigned = process.env.REDIS_ALLOW_SELF_SIGNED === 'true' || process.env.REDIS_TLS_REJECT_UNAUTHORIZED === '0';
    const caB64 = process.env.REDIS_TLS_CA_BASE64;
    const tls: Record<string, any> = {};

    if (allowSelfSigned) {
        tls.rejectUnauthorized = false;
        console.log('⚠️  TLS: Allowing self-signed certificates');
    }
    if (caB64) {
        try {
            tls.ca = Buffer.from(caB64, 'base64');
            console.log('✅ TLS: Using custom CA certificate');
        } catch (err) {
            console.warn('⚠️  Failed to parse REDIS_TLS_CA_BASE64, ignoring', err);
        }
    }
    return Object.keys(tls).length ? tls : undefined;
}

const tls = buildTlsConfig(redisUrl);
if (tls) {
    console.log('🔒 Using TLS connection');
    console.log('');
}

// Create Redis client
const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // Don't retry for testing
    lazyConnect: true,
    tls,
    connectTimeout: 5000,
});

let connected = false;
let authenticated = false;

// Event handlers
redis.on('connect', () => {
    console.log('🟡 TCP connection established (authentication pending...)');
    connected = true;
});

redis.on('ready', () => {
    console.log('🟢 Redis ready - connection and authentication successful!');
    authenticated = true;
});

redis.on('error', (err) => {
    const errorMsg = err.message || String(err);
    console.error('🔴 Redis Error:', errorMsg);
    
    if (errorMsg.includes('WRONGPASS') || errorMsg.includes('invalid password') || errorMsg.includes('NOAUTH')) {
        console.error('');
        console.error('❌ Authentication failed!');
        console.error('   Check that the password in REDIS_URL matches the Redis server password.');
        console.error('   Format: rediss://:password@host:port');
    } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
        console.error('');
        console.error('❌ Connection failed!');
        console.error('   Check that:');
        console.error('   1. Redis server is running');
        console.error('   2. Host and port are correct');
        console.error('   3. Firewall allows connections to the Redis port');
    } else if (errorMsg.includes('certificate') || errorMsg.includes('TLS')) {
        console.error('');
        console.error('❌ TLS/SSL error!');
        console.error('   If using self-signed certificate, set:');
        console.error('   REDIS_ALLOW_SELF_SIGNED=true');
    }
});

redis.on('close', () => {
    console.log('🔴 Connection closed');
});

// Test connection
async function testConnection() {
    try {
        console.log('🔄 Attempting to connect...');
        await redis.connect();
        
        // Wait a bit for events
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!connected) {
            console.error('❌ Connection timeout - Redis server may not be reachable');
            process.exit(1);
        }
        
        if (!authenticated) {
            console.error('❌ Authentication timeout - password may be incorrect');
            process.exit(1);
        }
        
        // Test a simple command
        console.log('');
        console.log('🧪 Testing Redis commands...');
        
        const testKey = 'test:connection:' + Date.now();
        await redis.set(testKey, 'test-value', 'EX', 10);
        console.log('✅ SET command successful');
        
        const value = await redis.get(testKey);
        if (value === 'test-value') {
            console.log('✅ GET command successful');
        } else {
            console.error('❌ GET command returned unexpected value:', value);
        }
        
        await redis.del(testKey);
        console.log('✅ DEL command successful');
        
        // Get Redis info
        const info = await redis.info('server');
        const versionMatch = info.match(/redis_version:([^\r\n]+)/);
        if (versionMatch) {
            console.log(`✅ Redis version: ${versionMatch[1]}`);
        }
        
        console.log('');
        console.log('✅ All tests passed! Redis connection is working correctly.');
        
    } catch (err: any) {
        console.error('');
        console.error('❌ Connection test failed:', err.message);
        process.exit(1);
    } finally {
        await redis.quit();
        process.exit(0);
    }
}

testConnection();

