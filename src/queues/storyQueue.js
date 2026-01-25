const { Queue } = require("bullmq");

const storyQueue = new Queue("storyQueue", {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    username: process.env.REDIS_USER || "default",
    password: process.env.REDIS_PASSWORD,
    // tls: { rejectUnauthorized: false }, // enable if Redis Cloud TLS
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
});

console.log("📬 StoryQueue initialized");

module.exports = { storyQueue };
