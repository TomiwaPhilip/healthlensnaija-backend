const cron = require('node-cron');
const ingestNigeriaHealthWatch = require('../scripts/ingestNigeriaHealthWatch');
const scrapeNigeriaHealthWatch = require('../utils/scrapeNigeriaHealthWatch');
const redis = require('../utils/redis');
const crypto = require('crypto');

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runIngestion() {
  console.log("🕒 Ingestion job started");
  const fullText = await scrapeNigeriaHealthWatch();
  const currentHash = hashContent(fullText);
  const lastHash = await redis.get('nhw:lastHash');

  if (currentHash === lastHash) {
    console.log("✅ No new data.");
    return;
  }

  await ingestNigeriaHealthWatch();
  await redis.set('nhw:lastHash', currentHash);
  console.log("✅ Ingestion complete");
}

cron.schedule('0 3 * * *', () => {
  runIngestion().catch(err => console.error(err));
});

console.log("🚀 Cron job scheduled daily 3AM");
