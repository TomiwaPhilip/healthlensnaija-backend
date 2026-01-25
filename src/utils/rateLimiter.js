// in utils/rateLimiter.js
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisClient = require('./redis'); // your existing redis.js

const forgotLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_forgot_email',
  points: 20,             // allow 20 requests
  duration: 60 * 5,       // per 5 minutes
  blockDuration: 60 * 5,  // block only 5 minutes
});

const forgotIPLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_forgot_ip',
  points: 100,            // allow 100 requests
  duration: 60 * 15,      // per 15 minutes
  blockDuration: 60 * 15,
});


module.exports = { forgotLimiter, forgotIPLimiter };
