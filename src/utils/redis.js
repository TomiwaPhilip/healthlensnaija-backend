// backend/src/utils/redis.js
const Redis = require('ioredis');

const redis = new Redis({
  username: process.env.REDIS_USER,     // e.g., 'default'
  password: process.env.REDIS_PASSWORD, // your Redis password
  host: process.env.REDIS_HOST,         // e.g., 'redis-1234...cloud.redislabs.com'
  port: Number(process.env.REDIS_PORT), // e.g., 14918
  connectTimeout: 10000,                // increases reliability
  retryStrategy: retries => Math.min(retries * 100, 2000), // reconnect logic
  // tls: { rejectUnauthorized: false }, // uncomment if using TLS
});

redis.on('connect', () => console.log('✅ Redis connected.'));
redis.on('error', err => console.error('❌ Redis error:', err));

module.exports = redis;
