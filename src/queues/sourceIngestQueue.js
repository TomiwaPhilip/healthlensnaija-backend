const { Queue, QueueScheduler } = require("bullmq");
const redisConnection = require("../config/redis");

const SOURCE_INGEST_QUEUE = process.env.SOURCE_INGEST_QUEUE || "newsroom-source-ingest";

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 30000,
  },
  removeOnComplete: 100,
  removeOnFail: 1000,
};

const sourceIngestQueue = new Queue(SOURCE_INGEST_QUEUE, {
  connection: redisConnection,
  defaultJobOptions,
});

const scheduler = new QueueScheduler(SOURCE_INGEST_QUEUE, {
  connection: redisConnection,
});

scheduler.waitUntilReady().catch((error) => {
  console.error("Source ingest queue scheduler failed to start", error);
});

async function enqueueSourceIngestJob(jobPayload = {}) {
  if (!jobPayload.sourceId || !jobPayload.storyId) {
    throw new Error("sourceId and storyId are required to enqueue ingestion job");
  }

  const jobName = jobPayload.type || "source-ingest";
  return sourceIngestQueue.add(jobName, jobPayload, {
    jobId: `${jobName}:${jobPayload.sourceId}:${Date.now()}`,
  });
}

module.exports = {
  SOURCE_INGEST_QUEUE,
  sourceIngestQueue,
  enqueueSourceIngestJob,
};
